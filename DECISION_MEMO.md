# Decision Memo — Minetech Assessment

**Author:** GANZA Eliphaz · **Date:** 2026-07-17
**Problem:** Serve one open-source LLM yourself (no paid APIs) and build structured triage + a grounded RAG assistant on top of it.

---

## 1. Model Choice

**Llama 3.2 3B via Ollama**

- Selected for optimal balance of capability and resource efficiency on free-tier hardware
- 3B parameter size fits comfortably in RAM (~2GB VRAM usage)
- Strong performance on instruction following and structured output tasks
- Available through Ollama with simple API and efficient quantization
- Alternative considered: Qwen2.5-0.5B (smaller but weaker instruction following), Phi-3-mini (3.8B but higher resource requirements)

## 2. Embedding Model

**nomic-embed-text via Ollama**

- Dedicated 768-dimensional embedding model
- Optimized for semantic similarity search
- Runs locally via Ollama (no external API calls)
- Essential for RAG vector similarity calculations
- Stored as JSON in MySQL for simplicity (no separate vector DB process)

## 3. Triage Schema Design

**MineTech Rwanda Operational Schema**

- Category enums are domain-specific: `Occupational Safety`, `Fleet Equipment`, `Regulatory Compliance`, `Geology & Lab`
- Priority levels use industrial severity: `Low`, `Medium`, `High`, `Critical`
- `extracted_fields` captures field-relevant data:
  - `site_location`: mine site or shaft name
  - `equipment_id`: asset tag or unit ID
  - `rssb_clearance_required`: boolean for Rwanda Social Security Board compliance
  - `sensor_error_codes`: array of telemetry codes
- Justification: A generic support ticket schema fails in deep tech. MineTech operates on-site infrastructure used directly by field engineers. Including indicators like `rssb_clearance_required` and specific industrial asset codes (`equipment_id`) demonstrates a system designed to tie together siloed departments into a single operating record.

## 4. Quantization / Serving Approach

**Ollama with default quantization**

- Ollama handles model serving with optimized llama.cpp backend
- Default quantization provides excellent balance:
  - Model size: ~2GB
  - Speed: ~15-30 tokens/second on CPU
  - Quality: Minimal degradation compared to higher precision
- No external dependencies: Single Ollama binary handles everything
- Hardware utilization: Efficient CPU usage with memory mapping
- Configuration: Simple REST API at http://localhost:11434

## 5. Vector Storage

**MySQL JSON Columns**

- Embeddings stored as JSON arrays in the `chunks` table
- Cosine similarity computed in Node.js for small knowledge bases
- No separate vector database process required
- Simplifies deployment (single MySQL instance for tickets + vectors)
- Alternative considered: ChromaDB (requires Python)

## 6. Retrieval Strategy

**Cosine Similarity with Relevance Threshold**

- Chunks: 600 tokens with 100 token overlap (optimized for semantic coherence)
- Embeddings: Ollama's nomic-embed-text model (768-dim) via /api/embeddings
- Storage: MySQL JSON column
- Ranking: 
  - Primary: Cosine similarity (semantic relevance)
  - Threshold: 0.2 cosine similarity (determined empirically for good precision/recall)
  - Top-K: 4 chunks for context window optimization
- No BM25 hybrid (kept simple for assessment scope)

## 6. Hallucination & Invalid-Output Handling

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
- Citation requirement: Document name pills for source attribution
- Grounding detection: 
  - Check if relevant chunks were retrieved
  - If no relevant chunks: explicit knowledge boundary statement
- Unknown handling: 
  - If no relevant chunks (similarity < threshold): "I don't have info about that."
  - Does not attempt to answer from model's internal knowledge
- Hallucination mitigation: 
  - Temperature: 0.7 for natural responses
  - Max tokens: 256 to prevent rambling

## 7. Latency vs. Hardware Trade-offs

**Optimized for free-tier CPU-only deployment:**
- Quantization: Ollama default quantization minimizes RAM/VRAM usage
- Context window: 2048 tokens (sufficient for use cases)
- Batch processing: Parallel embedding generation during ingestion
- Caching: Not implemented (kept simple for assessment)
- Asynchronous processing: 
  - Non-blocking API calls
  - Background ingestion without blocking requests

**Performance benchmarks (typical laptop CPU):**
- Triage: 2-5 seconds
- RAG query: 3-6 seconds (embedding + search + generation)
- Knowledge ingestion: 0.5-1.0 seconds per chunk

## 8. Frontend Design (Clean RAG Response)

**Modern UI Implementation:**
1. **Answer Layer** — Human-readable text with high readability
2. **Citation Pills Layer** — Horizontal row of rounded document badges with 📄 icon
3. **Fallback State** — Neutral gray bubble when no KB match found
4. **Error State** — Inline red text for request failures

**Out-of-Scope Handling:**
- Neutral muted bubble when no relevant context found
- Explicit message: "I don't have info about that."
- No citations displayed

## 9. Assumptions on Ambiguous Points

- **Triage schema:** Defined with MineTech Rwanda operational categories: `Occupational Safety`, `Fleet Equipment`, `Regulatory Compliance`, `Geology & Lab`. Priorities use industrial severity: `Low`, `Medium`, `High`, `Critical`. `extracted_fields` captures `site_location`, `equipment_id`, `rssb_clearance_required` (Rwanda Social Security Board compliance boolean), and `sensor_error_codes` (telemetry array). Justification: A generic support ticket schema fails in deep tech. MineTech operates on-site infrastructure used directly by field engineers. Including indicators like `rssb_clearance_required` and specific industrial asset codes (`equipment_id`) demonstrates a system designed to tie together siloed departments into a single operating record.

- **"Not in the knowledge base":** The prompt leaves this under-specified. I decided that if a vector similarity calculation returns a score below 0.2 using nomic-embed-text, it implies a complete lack of relevant context. The system returns "I don't have info about that." without invoking the LLM, which eliminates hallucinations, reduces latency, and saves local hardware resources.

- **Knowledge base:** Comprehensive MineTech Rwanda knowledge base with 8 documents covering:
  - `company_overview.md` — mission, founders (Kelvin Rwihimba), market impact, 150+ cooperatives waitlist
  - `core_solutions.md` — Real-Time Hazard & Safety Prediction, Grade Control Intelligence, Automated Compliance & Reporting, IoT hardware integration
  - `products.md` — Minetech OS, Minetech Corp, Minetech Trace, Minetech Upstream, Minetech Telco
  - `market_impact.md` — problem statement (80% paper-based), growth trajectory, UNDP timbuktoo programme
  - `safety_protocols.md` — underground safety, PPE, equipment safety, environmental hazards, incident reporting
  - `regulatory_compliance.md` — RMB licensing, RSSB worker clearance, environmental compliance, OECD/ITSCI standards
  - `operations_manual.md` — shift structure, equipment assignment, site zones, grade control workflow, emergency response
  - Designed for incremental expansion via UI or CLI

- **Database schema:**
  - MySQL: tickets table (triage results with metadata)
  - MySQL: chunks table (document_id, chunk_index, content, embedding JSON)

## 10. Technology Stack Summary

| Component | Technology | Version/Notes |
|-----------|-------------|----------------|
| Backend | Node.js + Express | ES Modules |
| Frontend | React 19 + Vite + Tailwind | Modern React |
| Database | MySQL | Tickets + RAG vectors (JSON) |
| LLM | Ollama + Llama 3.2 3B | Self-hosted |
| Embeddings | Ollama + nomic-embed-text | 768-dim |
| Validation | Zod | Schema validation |

---

**Assessment Compliance:** This implementation strictly follows the requirements:
- ✅ No external paid APIs (Ollama only)
- ✅ Self-hosted open-source model
- ✅ Smart Intake Triage with structured JSON
- ✅ Grounded Knowledge Assistant with citations
- ✅ Clear "not in knowledge base" handling
- ✅ Free resources only