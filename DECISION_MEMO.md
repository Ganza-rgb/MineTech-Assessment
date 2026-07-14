# Decision Memo — Minetech Assessment

**Author:** GANZA Eliphaz · **Date:** 2026-07-14
**Problem:** Serve one open-source LLM ourselves (no paid APIs) and build structured triage + a grounded RAG assistant on top of it.

---

## 1. Model choice

**Qwen/Qwen2.5-7B-Instruct (cloud) / Qwen2.5-0.5B-Instruct (local ONNX fallback).**

- Primary: Hugging Face Inference API with `@huggingface/inference` SDK. No local download, no GPU, 2–4s latency on the free tier. Works on any machine with internet and a free HF token.
- Fallback: `@huggingface/transformers` loading ONNX weights directly in Node (`onnx-community/Qwen2.5-0.5B-Instruct`, Q4). CPU-only by default for maximum compatibility; cached in `~/.cache/huggingface` after first download.
- Embeddings: `sentence-transformers/all-MiniLM-L6-v2` (384-d). Small, fast, and accurate enough for passage retrieval in a small KB.

Both paths go through the same `aiService` interface (`generate` + `embed`), so swapping providers touches only that file.

---

## 2. Quantization / serving approach

- **Cloud:** No quantization needed — HF Inference API handles model hosting. We pass root-level OpenAI-compatible parameters (`temperature`, `max_tokens`) to the `/v1/chat/completions` endpoint.
- **Local:** Q4 quantization via ONNX. Balances size (~400 MB for 0.5B) and speed on CPU. `TRANSFORMERS_DEVICE` can switch to `webgpu`/`wasm` when available.
- Weights are pulled from the HF Hub once and cached locally. No Python runtime, no external server process, no commercial API.

---

## 3. Retrieval strategy

**Cosine similarity over `all-MiniLM` embeddings, with keyword fallback.**

- Chunks are ~600 chars with 100-char overlap, split on sentence boundaries.
- Embeddings stored as JSON arrays in MySQL; similarity computed in Node (fine for <100 chunks).
- If the cloud embedding endpoint fails, retrieval falls back to token-overlap scoring so RAG still works during HF API hiccups.
- Top-k = 4, threshold = 0.2 cosine.

Why not BM25: simpler code, fewer dependencies, and sufficient for a small KB. I would reintroduce hybrid BM25+cosine if the corpus grows beyond a few hundred chunks.

---

## 4. Hallucination & invalid-output handling

**Triage (structured generation):**
1. Model emits JSON per a strict schema prompt.
2. Parse → regex-extract first `{…}` → one repair re-prompt → **heuristic fallback** if still unparseable.
3. Every output is **Zod-validated and coerced** (unknown enum → `other`/`low`, clamped confidence). The dashboard never receives malformed data.

**RAG (grounded answering):**
- The model is instructed to answer only from numbered context and cite with `[1]`, `[2]`, etc.
- Hard guard: if retrieval returns no chunk above the cosine threshold, we return the model output with `grounded: false`, `confidence: 0`, and zero citations. The model is still called with the base system prompt (no hardcoded refusal messages), so it can respond naturally when context is thin.
- Citations are parsed from the model output using regex; only cited chunks are returned.

**Topic restriction (anti-hallucination):**
- The system prompt explicitly restricts the assistant to MineTech topics: operations, safety, technical support, billing, and account access.
- Off-topic questions (sports, politics, entertainment, etc.) are refused by the model and redirected to MineTech support. This prevents the assistant from answering general knowledge questions that could erode user trust in safety-critical environments.

---

## 5. Latency vs. hardware trade-offs

- **Cloud mode (default):** Skips the RAG retrieval loop and goes straight to `ai.generate()` — one HF API call, ~2–4s. Topic restriction is enforced via system prompt, not retrieval. This is the explicit trade-off: speed over grounding.
- **Local mode:** Runs full RAG (embed query + cosine + generate), ~5–15s on CPU. Only used when cloud is unavailable or the user explicitly opts in.
- `max_tokens: 128` keeps cloud latency low on the free tier. I would raise this with streaming for production.
- `topK: 4` for local (more context for grounding).
- CPU is the default device because it requires zero setup. WebGPU/WASM is one env var away when available.

---

## 6. Assumptions on ambiguous points

- **Triage schema:** Defined as `{category ∈ {billing,technical,account,feature_request,feedback,other}, priority ∈ {low,medium,high,urgent}, priority_reason, sentiment, language, key_entities{product,email,order_id,customer_name}, summary, suggested_reply, confidence}`. Priority is rule-driven (urgency/impact language → urgent; broken/failing → high; billing → medium).
- **"Not in the knowledge base":** Defined as no retrieved chunk with cosine ≥ 0.2. When this happens, the model is still called with the base system prompt and responds naturally without hardcoded messages. `grounded` is false and `confidence` is 0.
- **Knowledge base:** Seeded with `backend/data/safety_protocols.txt` and `backend/data/technical-faq.md`; ingestible at runtime via UI or `npm run ingest`.
- **Database:** MySQL (per requested stack), schema auto-created on boot. JSON columns used for flexible storage of embeddings and entities.
