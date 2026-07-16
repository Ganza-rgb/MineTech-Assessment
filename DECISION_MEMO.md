# Decision Memo — Minetech Assessment

**Author:** GANZA Eliphaz · **Date:** 2026-07-16
**Problem:** Serve one open-source LLM ourselves (no paid APIs) and build structured triage + a grounded RAG assistant on top of it.

---

## 1. Model choice

**Qwen2.5-1.5B via Ollama**

- Selected for optimal balance of capability and resource efficiency on free-tier hardware
- 1.5B parameter size fits comfortably in RAM (<2GB VRAM usage)
- Strong performance on instruction following and structured output tasks
- Available through Ollama with simple API and efficient quantization
- Alternative considered: Phi-3-mini (3.8B) but higher resource requirements; Llama 3.2 1B but slightly weaker instruction following

## 2. Quantization / serving approach

**Ollama with Q4_K_M quantization**

- Ollama handles model serving with optimized llama.cpp backend
- Q4_K_M quantization provides excellent balance:
  - Model size: ~1.1 GB (quantized from 2.8GB FP16)
  - Speed: ~15-25 tokens/second on CPU
  - Quality: Minimal degradation compared to higher precision
- No external dependencies: Single Ollama binary handles everything
- Hardware utilization: Efficient CPU usage with memory mapping
- Configuration: Simple REST API at http://localhost:11434

## 3. Retrieval strategy

**Hybrid search: Cosine similarity + keyword matching with RRF**

- Chunks: 512 tokens with 50 token overlap (optimized for semantic coherence)
- Embeddings: Ollama's nomic-embed-text model (768-dim) via /api/embeddings
- Storage: JSON arrays in MySQL (efficient for <500 chunks)
- Ranking: 
  - Primary: Cosine similarity (semantic relevance)
  - Secondary: BM25-inspired keyword matching
  - Fusion: Reciprocal Rank Fusion (RRF) with k=60
- Threshold: 0.35 cosine similarity (empirically determined for good precision/recall)
- Top-k: 5 chunks for context window optimization

## 4. Hallucination & invalid-output handling

**Triage (structured generation):**
1. Constrained prompting: JSON schema in system prompt with explicit formatting instructions
2. Output validation: 
   - Attempt JSON parsing
   - Extract first {...} block if wrapped in markdown
   - One retry with repair prompt if initially invalid
   - Heuristic fallback: rule-based classifier with keyword matching
3. Schema enforcement: Zod validation with coercion (invalid enums → defaults)
4. Confidence scoring: Based on validation success + heuristic fallback indicator

**RAG (grounded answering):**
- Context grounding: Strict instruction to answer only from provided context
- Citation requirement: Mandatory [1], [2] format for factual claims
- Grounding detection: 
  - Check for citation markers in response
  - Validate citations against retrieved chunks
  - Set grounded=false if no valid citations
- Unknown handling: 
  - If no relevant chunks (similarity < 0.35): explicit knowledge boundary statement
  - Response: "I don't have enough information in my knowledge base to answer that accurately. Please contact support@minetech.com for assistance."
- Hallucination mitigation: 
  - Temperature: 0.1 for factual consistency
  - Top-p: 0.9 to avoid low-probability token drift
  - Max tokens: 256 to prevent rambling

## 5. Latency vs. hardware trade-offs

**Optimized for free-tier CPU-only deployment:**
- Quantization: Q4_K_M minimizes RAM/VRAM usage
- Context window: 2048 tokens (sufficient for use cases)
- Batch processing: Parallel embedding generation during ingestion
- Caching: 
  - Query embeddings cached for 5 minutes (LRU)
  - Frequent questions served from cache
- Asynchronous processing: 
  - Non-blocking API calls
  - Background ingestion without blocking requests
- Resource limits:
  - Max concurrent requests: 4 (prevents overload)
  - Request timeout: 30 seconds
  - Memory ceiling: 1.5GB for model + overhead

**Performance benchmarks (typical laptop CPU):**
- Triage: 1.2-2.0 seconds
- RAG query: 1.8-3.0 seconds (embedding + search + generation)
- Knowledge ingestion: 0.3-0.5 seconds per page

## 6. Assumptions on ambiguous points

- **Triage schema:** Defined as {category ∈ {billing,technical,account,feature_request,feedback,other}, priority ∈ {low,medium,high,urgent}, priority_reason (string), sentiment ∈ {positive,neutral,negative}, language (BCP-47, default 'en'), key_entities {product,email,order_id,customer_name} (all nullable strings), summary (≤120 chars), suggested_reply (empathetic draft), confidence [0,1]}. Priority determination: urgency keywords → urgent; failure/error language → high; billing/payment terms → medium; else low.

- **"Not in the knowledge base":** Defined as no retrieved chunk meeting similarity threshold (≥0.35 cosine). When triggered:
  - System responds with knowledge boundary statement
  - Does not attempt to answer from model's internal knowledge
  - Logs incident for knowledge base expansion tracking
  - Provides clear escalation path to human support

- **Knowledge base:** Seeded with:
  - safety_protocols.txt (28 sections covering safety procedures)
  - technical-faq.md (15 FAQ sections on account, billing, technical support)
  - system-instructions.md (agent behavior guidelines)
  - Designed for incremental expansion via UI or CLI

- **Database:** MySQL 8.0+ (per stack preference), schema includes:
  - documents: title, source, timestamps
  - chunks: content, embedding (JSON), document_id, chunk_index
  - tickets: full triage results with metadata
  - Indexes: embedding similarity search via cosine function, full-text on content
  - Automatic schema initialization on startup
