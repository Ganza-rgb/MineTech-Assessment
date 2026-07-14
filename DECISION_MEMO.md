# Decision Memo — Minetech Assessment

**Author:** candidate · **Date:** 2026-07-13
**Problem:** Serve one open-source LLM ourselves (no paid APIs) and build
structured triage + a grounded RAG assistant on top of it.

---

### 1. Model choice
**Llama 3.2 1B (via Hugging Face Inference API) / Qwen2.5-0.5B-Instruct (local ONNX fallback).** Chosen because they are strong, licence-permissive instruct models that run on free resources. The local ONNX variant runs on CPU within ~1 GB RAM, keeping the build free and reproducible on a normal laptop. The 0.5B variant is the default for speed; 1.5B/3B are one-line upgrades for quality. For embeddings I use **all-MiniLM-L6-v2 (384-d)** — small, fast, and accurate enough for passage retrieval.

### 2. Serving approach
Two modes are supported via `LLM_MODE`:
- **cloud** (default): Uses the Hugging Face Inference API with `@huggingface/inference` SDK. No local model download required; works on any machine with internet and a free HF token.
- **local**: Uses `@huggingface/transformers` loading **ONNX** weights directly in the Node process — no Python, no external server, no commercial API. Default **`q4`** weight type balances size/speed on CPU; `TRANSFORMERS_DEVICE` can switch to `webgpu`/`wasm` when available. Weights are pulled from the HF Hub once and cached.

Both paths go through the same `aiService` interface (`generate` + `embed`), so swapping providers touches only that file. The cloud path uses `chatCompletion()` for chat-format models; the local path uses `pipeline('text-generation', ...)`.

### 3. Retrieval strategy (RAG)
**Cosine similarity over `all-MiniLM` embeddings** (L2-normalized), stored as JSON arrays in MySQL. The original design called for hybrid BM25 + cosine retrieval, but the current implementation uses cosine-only for simplicity and because the knowledge base is small (<100 chunks). Retrieval is in-memory over MySQL-stored embeddings. Top-k = 4. For scale, move to MySQL `VECTOR` (8.0.32+) or pgvector.

Chunks are ~600 chars with 100-char overlap, split on sentence/paragraph boundaries.

### 4. Hallucination & invalid-output handling
- **Invalid JSON (triage):** parse → regex-extract first `{…}` → one *repair* re-prompt → **heuristic fallback** that still returns a valid object (flagged `meta.repaired` / `fatal_fallback`). Every output is **Zod-validated and coerced** (unknown enum → `other`/`low`, clamped confidence), so the dashboard never receives a malformed record.
- **Hallucination (RAG):** the model is instructed to answer **only** from the numbered context and to emit a fixed "I don't have information about that in the knowledge base" phrase when unsupported. Hard guard: if retrieval returns **no chunk above the cosine threshold**, we short-circuit and return that message with **zero citations** — the model is never even called on empty context, so it cannot fabricate. `grounded` is false unless citations are present.

### 5. Latency vs. hardware trade-offs
Running a 1.5B Q4 model on CPU gives ~a few tokens/sec — acceptable for batch/dashboard triage and short KB answers, too slow for high-throughput chat. Primary lever: **model size** (0.5B→3B) and **device** (CPU→WebGPU). Secondary: `max_new_tokens` capped at 512 and `RAG_TOP_K`=4 to bound context. The `mock` mode exists so the app is demoable/deterministic without any download, decoupling "does the pipeline work" from "is the GPU free".

### 6. Assumptions on the deliberately ambiguous points
- **Triage schema:** I defined `{category∈{billing,technical,account, feature_request,feedback,other}, priority∈{low,medium,high,urgent}, priority_reason, sentiment, language, key_entities{product,email,order_id, customer_name}, summary, suggested_reply, confidence}`. Priority is rule-driven (urgency/impact language ⇒ urgent; broken/failing ⇒ high; billing ⇒ medium).
- **"Not in the knowledge base":** Defined as *no retrieved chunk with cosine ≥ 0.25*. When this happens, the assistant says it does not have that information and redirects to support@minetech. This is enforced server-side before the model is called, so it cannot hallucinate.
- **Knowledge base:** Seeded with `backend/data/safety_protocols.txt` (operational handbook) and `technical-faq.md` as the grounded corpus; ingestible at runtime.
- **Database:** MySQL (per the requested stack), schema auto-created on boot.

### 7. Engineering trade-offs
| Decision | Rationale | What I'd change with more time/hardware |
|----------|-----------|----------------------------------------|
| Cosine-only retrieval (no BM25) | Simpler code, fewer dependencies, sufficient for <100 chunks | Re-introduce BM25 hybrid (0.7 cosine + 0.3 BM25) for better exact-term matching |
| Embeddings as JSON in MySQL | Works immediately, no schema migrations needed | Switch to MySQL `VECTOR` type (8.0.32+) for native ANN and better performance |
| `maxTokens = 256` | Keeps cloud latency low on free HF tier; prevents runaway generations | Raise to 512–1024 with streaming for better answer completeness |
| `cpu` default device | Maximum compatibility; no WebGPU/WASM assumptions | Default to `webgpu` when available, fall back to `cpu` |
| Cloud-first with local fallback | Fastest time-to-working on any machine; free HF tier is generous | Make local primary for true air-gapped self-hosting; keep cloud as optional accelerator |
| No streaming | Simpler frontend state management; avoids partial-render UX bugs | Implement SSE/streaming for real-time token display |
| Separate cloud/local paths in `answer()` | Cloud was optimized as a "fast path" skipping RAG for speed | Unify both paths to always run RAG first, ensuring consistent grounding |

### 8. What I would do with more time
GPU-backed serving (vLLM/llama.cpp server) behind the same `aiService` interface; pgvector for billion-scale retrieval; streaming chat responses; and evals (triage accuracy + RAG faithfulness) wired into CI.
