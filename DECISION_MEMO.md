# Design Document — Minetech Assessment

**Author:** candidate · **Date:** 2026-07-14
**Problem:** Serve one open-source LLM ourselves (no paid APIs) and build
structured triage + a grounded RAG assistant on top of it.

---

## 1. Problem Statement

Build a full-stack application that:
1. Serves an open-source LLM without relying on commercial APIs
2. Implements Smart Intake Triage (structured generation) with graceful error handling
3. Implements a Grounded Knowledge Assistant (RAG) with citations
4. Runs on free resources with acceptable latency

## 2. Model Strategy

### Decision: Cloud-first with local fallback
**Rationale:**
- Primary path: Hugging Face Inference API with `meta-llama/Llama-3.2-1B-Instruct` via `@huggingface/inference` SDK
  - No local model download required (~1 GB)
  - Fast response times (2-4s on free tier)
  - No GPU required
  - Works on any machine with internet

- Fallback path: `@huggingface/transformers` loading ONNX weights locally
  - For air-gapped environments or HF API downtime
  - Qwen2.5-0.5B-Instruct (fast, small footprint)
  - CPU-only by default for maximum compatibility

**Trade-offs:**
- Cloud mode depends on internet + HF token validity
- Local mode is slower but fully self-contained
- Both paths use the same `aiService` interface (`generate` + `embed`)

### Model Parameters
- Temperature: 0.7 (balanced creativity/consistency)
- Max tokens: 128 (keeps cloud latency low on free tier)
- Embedding model: `sentence-transformers/all-MiniLM-L6-v2` (384-d, fast, accurate)

## 3. Architecture

### Service Layer Design
```
aiService.js     - Model boundary (generate, embed, health)
triageService.js - Use Case 1: structured generation + validation
ragService.js    - Use Case 2: retrieval + grounded answering
```

**Key principle:** The model is isolated behind `aiService`. Swapping providers (Ollama, vLLM, different HF model) touches only that file.

### Triage Pipeline
1. User submits raw text
2. Model generates JSON (system prompt with schema)
3. Parse → regex-extract → repair re-prompt → heuristic fallback
4. Zod validation + coercion (unknown enum → `other`/`low`)
5. Store in MySQL with metadata (repaired, fatal_fallback, provider)
6. Return structured JSON to frontend

**Why this design:**
- Multi-stage fallback ensures the dashboard never receives malformed data
- Heuristic fallback keeps the pipeline resilient to bad model outputs
- Zod validation provides runtime type safety

### RAG Pipeline
1. User submits question
2. Retrieve top-K chunks from MySQL (cosine similarity over embeddings)
3. If embeddings fail, fall back to keyword overlap scoring
4. Inject relevant context into system prompt
5. Model generates answer with citation markers `[1]`, `[2]`, etc.
6. Parse citations from model output
7. Return answer + citations + grounded flag + confidence score

**Design decisions:**
- Cosine-only retrieval (no BM25): simpler code, fewer dependencies, sufficient for <100 chunks
- Embeddings stored as JSON in MySQL: works immediately, no schema migrations
- Keyword fallback when embeddings fail: ensures RAG still works during HF API hiccups
- Unified code path: both cloud and local modes run retrieval (no shortcuts)

## 4. Frontend Architecture

### Component Structure
```
App.jsx                    - Root layout, nav, error boundary
├── TriageDashboard.jsx    - Input form + filterable table
└── KnowledgeAssistant.jsx - Chat UI with auto-scroll
```

### UX Decisions
- **Auto-scroll chat:** Sentinel div + `scrollIntoView` on message/loading changes
- **Skeleton loading:** Initial load shows placeholder skeletons, not empty state
- **Error boundary:** Catches React errors without crashing the entire app
- **Responsive nav:** Logo left, tabs right, health pill hidden on mobile
- **Filter auto-refresh:** `useEffect` on filter state triggers API call

## 5. API Design

### Endpoints
| Method | Path | Purpose | Validation |
|--------|------|---------|------------|
| GET | `/api/health` | Provider mode + KB stats | None |
| POST | `/api/triage` | Classify/extract/draft → JSON | Zod: text required |
| GET | `/api/tickets` | List tickets (filterable) | Query params |
| PATCH | `/api/tickets/:id` | Update status | Zod: status enum |
| POST | `/api/rag/ask` | Answer + citations | Zod: question required |
| POST | `/api/rag/retrieve` | Raw passages (debug) | Zod: question required |
| POST | `/api/rag/ingest` | Re-ingest KB files | None |
| POST | `/api/rag/ingest/text` | Ingest arbitrary doc | Zod: title + content |
| GET | `/api/rag/stats` | KB document/chunk count | None |

### Request/Response Flow
```
Frontend → Express → Validation (zod) → Service → Model/DB → Response
                ↓
          Structured logging (request ID, duration, metadata)
```

## 6. Security & Reliability

### Input Validation
- All POST bodies validated with Zod schemas before processing
- SQL queries use parameterized statements (mysql2 `?` placeholders)
- No raw SQL concatenation with user input

### Logging
- Every request gets a unique ID (UUID)
- Structured logs include: timestamp, level, request ID, endpoint, duration, metadata
- Errors include stack traces in development, sanitized in production
- No secrets logged (API keys, passwords)

### Error Handling
- Model errors: logged + 500 response with generic message
- Validation errors: 400 with field-level details
- DB errors: logged + 500 response
- Frontend: Error boundary catches React errors, shows user-friendly message

## 7. Performance

### Cloud Mode (Default)
- Single API call per request (no RAG overhead)
- Response time: 2-4 seconds
- Embedding retry with backoff (3 attempts, 500ms/1s delays)
- Request timeout: 60s (AbortController)

### Local Mode (Fallback)
- RAG retrieval: embedding generation + cosine similarity
- Response time: 5-15 seconds (CPU-bound)
- Keyword fallback when embeddings fail

### Optimization Decisions
- `max_tokens: 128` keeps cloud latency low
- `topK: 1` for cloud (fast, no citations needed)
- `topK: 4` for local (more context for grounding)
- LIMIT 50/100 on DB queries to prevent full table scans

## 8. Database Schema

```sql
tickets     - Structured triage results (category, priority, entities, reply)
documents   - KB documents (title, source, created_at)
chunks      - Text chunks with embeddings (JSON array)
```

**Why MySQL:**
- Requested stack
- JSON columns for flexible schema (embeddings, entities)
- AUTO_INCREMENT for simple ID management
- FULLTEXT index on chunks for keyword fallback

## 9. What We'd Improve With More Time

1. **Streaming responses** - SSE for real-time token display in chat
2. **Vector database** - pgvector or MySQL VECTOR for billion-scale retrieval
3. **Caching** - Redis for frequent queries and embeddings
4. **Rate limiting** - Prevent abuse of HF API (per-user quotas)
5. **Authentication** - JWT or session-based auth for production use
6. **Tests** - Integration tests for all endpoints, CI/CD pipeline
7. **Monitoring** - Prometheus metrics, APM for model latency tracking
8. **Prompt engineering** - A/B testing different system prompts for triage accuracy

## 10. Assumptions

- **Triage schema:** Defined as `{category, priority, priority_reason, sentiment, language, key_entities, summary, suggested_reply, confidence}` with 6 categories and 4 priorities
- **"Not in KB":** Model responds naturally without hardcoded messages. When no relevant chunks found, model is still called with base system prompt
- **Knowledge base:** Seeded with `safety_protocols.txt` and `technical-faq.md`; ingestible at runtime
- **Deployment:** Single-server deployment (no load balancer, no container orchestration)
