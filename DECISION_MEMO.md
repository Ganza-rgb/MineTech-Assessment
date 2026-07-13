# Decision Memo — Minetech Assessment

**Author:** candidate · **Date:** 2026-07-13
**Problem:** Serve one open-source LLM ourselves (no paid APIs) and build
structured triage + a grounded RAG assistant on top of it.

---

### 1. Model choice
**Qwen2.5-1.5B-Instruct (Q4 GGUF → ONNX).** Chosen because it is a strong,
licence-permissive instruct model that runs on CPU within ~1 GB RAM, which keeps
the build free and reproducible on a normal laptop. The 0.5B variant is the
default for speed; 1.5B/3B are one-line upgrades for quality. For embeddings I
use **all-MiniLM-L6-v2 (384-d)** — small, fast, and accurate enough for
passage retrieval.

### 2. Quantization / serving approach
Served with **`@huggingface/transformers` (Transformers.js)** loading **ONNX**
weights directly in the Node process — no Python, no external server, no
commercial API. Default **`q4`** weight type balances size/speed on CPU;
`TRANSFORMERS_DEVICE` can switch to `webgpu`/`wasm` when available. Weights are
pulled from the HF Hub once and cached. This is the most "self-hosted Hugging
Face" native option for a JS stack and avoids the Ollama/vLLM operational
overhead while still being a real local model.

### 3. Retrieval strategy (RAG)
**Hybrid retrieval:** semantic (cosine over `all-MiniLM` embeddings,
L2-normalized) blended with **BM25** lexical scoring — `score = 0.7·cosine +
0.3·bm25_norm`. Hybrid covers synonym vs. exact-term queries better than either
alone. Chunks are ~600 chars with 100-char overlap, split on sentence/paragraph
boundaries. Retrieval is in-memory over MySQL-stored embeddings (fine for a
small KB; production → MySQL `VECTOR` / pgvector). Top-k = 4.

### 4. Hallucination & invalid-output handling
- **Invalid JSON (triage):** parse → regex-extract first `{…}` → one
  *repair* re-prompt → **heuristic fallback** that still returns a valid object
  (flagged `meta.repaired` / `fatal_fallback`). Every output is **Zod-validated
  and coerced** (unknown enum → `other`/`low`, clamped confidence), so the
  dashboard never receives a malformed record.
- **Hallucination (RAG):** the model is instructed to answer **only** from the
  numbered context and to emit a fixed "I don't have information about that in
  the knowledge base" phrase when unsupported. Hard guard: if retrieval returns
  **no chunk above the cosine threshold**, we short-circuit and return that
  message with **zero citations** — the model is never even called on empty
  context, so it cannot fabricate. `grounded` is false unless citations are
  present.

### 5. Latency vs. hardware trade-off
Running a 1.5B Q4 model on CPU gives ~a few tokens/sec — acceptable for
batch/dashboard triage and short KB answers, too slow for high-throughput chat.
Primary lever: **model size** (0.5B→3B) and **device** (CPU→WebGPU). Secondary:
`max_new_tokens` capped at 512 and `RAG_TOP_K`=4 to bound context. The offline
`mock` mode exists so the app is demoable/deterministic without any download,
decoupling "does the pipeline work" from "is the GPU free".

### 6. Assumptions on the deliberately ambiguous points
- **Triage schema:** I defined `{category∈{billing,technical,account,
  feature_request,feedback,other}, priority∈{low,medium,high,urgent},
  priority_reason, sentiment, language, key_entities{product,email,order_id,
  customer_name}, summary, suggested_reply, confidence}`. Priority is rule-driven
  (urgency/impact language ⇒ urgent; broken/failing ⇒ high; billing ⇒ medium).
- **"Not in the knowledge base":** defined as *no retrieved chunk with cosine ≥
  0.25* **or** the model emits the fixed abstain phrase. Either condition yields
  an honest, citation-free "not in KB" answer.
- **Knowledge base:** seeded with `backend/data/safety_protocols.txt`
  (operational handbook) as the grounded corpus; ingestible at runtime.
- **Database:** MySQL (per the requested stack), schema auto-created on boot.

### 7. What I would do with more time
GPU-backed serving (vLLM/llama.cpp server) behind the same `aiService`
interface; pgvector for billion-scale retrieval; streaming chat responses; and
evals (triage accuracy + RAG faithfulness) wired into CI.
