# Minetech Assessment — Self-Hosted LLM: Intake Triage + Knowledge Assistant

A full-stack app that serves an open-source LLM via **self-hosted Ollama** (no external APIs) and builds two features on top of it — no OpenAI/Anthropic/Gemini, no money spent:

1. **Smart Intake Triage** — turn free-text tickets/feedback into validated, structured JSON (category, priority, extracted fields, drafted reply) shown in a filterable dashboard. Malformed model output is handled gracefully.
2. **Knowledge Assistant** — answer questions with a self-hosted open-source LLM. Retrieves relevant context from a MySQL-backed knowledge base and grounds the answer with citations. Clearly indicates when the answer is not in the knowledge base.

> **Stack:** Node + Express · React + Tailwind (Vite) · MySQL · **Ollama (self-hosted)**
> 
> **Model:** Qwen2.5-1.5B (via Ollama) — runs completely free on local hardware

---

## 1. Prerequisites

- **Node.js 20+** and **npm**
- **MySQL** (local or remote). The app creates tables automatically on boot.
- **Ollama** installed and running (https://ollama.com/download)
  - Pull the model: `ollama pull qwen2.5:1.5b`
  - Verify it's running: `ollama list` should show `qwen2.5:1.5b`

---

## 2. Install

```bash
# backend
cd backend
npm install

# frontend
cd ../frontend
npm install
```

---

## 3. Configure

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set your MySQL credentials (`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`). Defaults assume a local MySQL.

Key settings (already pre-configured for Ollama):

```ini
# Server
PORT=4000

# MySQL (update with your credentials)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=1234
MYSQL_DATABASE=minetech

# LLM Provider - OLLAMA (SELF-HOSTED)
LLM_MODE=ollama

# Ollama configuration
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b

# Generation parameters
LLM_TEMP=0.7
LLM_MAX_TOKENS=128

# RAG settings
RAG_CHUNK_SIZE=600
RAG_CHUNK_OVERLAP=100
RAG_TOP_K=4
RAG_SIM_THRESHOLD=0.2
RAG_LEXICAL_WEIGHT=0.3
```

> 💡 **Note**: The `.env` file is already configured for Ollama by default. You only need to update MySQL credentials if different from the defaults.

---

## 4. Run the app

### Terminal 1 — Start Ollama (if not running as service)
```bash
ollama serve
```
*Leave this running in the background*

### Terminal 2 — Backend
```bash
cd backend
npm run dev
```

### Terminal 3 — Ingest knowledge base (run once)
```bash
cd backend
npm run ingest
```

### Terminal 4 — Frontend
```bash
cd ../frontend
npm run dev
```

Open the frontend URL (default http://localhost:5173).

---

## 5. Use the features

### Smart Intake Triage
1. Paste a message (or click a *Sample*) in the Triage tab
2. Hit **Run triage**
3. View structured JSON output with:
   - Category (billing/technical/account/feature_request/feedback/other)
   - Priority (low/medium/high/urgent) with justification
   - Extracted entities (email, order_id, etc.)
   - Summary and suggested reply
   - Confidence score
4. The result appears in the dashboard table below
5. Filter by category, priority, status, or search keyword
6. Update ticket status inline (new → in-progress → resolved)

### Knowledge Assistant
1. Switch to the Knowledge Assistant tab
2. Ask a question about MineTech operations, safety, technical support, billing, or account access
3. View the answer with:
   - **Citations** ([1], [2]) when grounded in the knowledge base
   - **Grounded status** indicator (true/false)
   - **Confidence score** (0-1)
4. If the question is outside the knowledge base:
   - The model will respond that it doesn't have that information
   - `grounded: false` and `confidence: 0`
   - No citations will be shown
5. Click suggestion buttons for common queries
6. Add your own documents:
   - Place `.txt` or `.md` files in `backend/data/`
   - Click **Re-ingest KB** in the UI, or run `npm run ingest` in backend

---

## 6. API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Provider mode + KB stats |
| POST | `/api/triage` | Classify/extract/draft one message → JSON |
| GET | `/api/tickets` | List tickets (`?category&priority&status&q`) |
| PATCH | `/api/tickets/:id` | Update ticket status |
| POST | `/api/rag/ask` | Answer + citations (grounded RAG) |
| POST | `/api/rag/retrieve` | Raw retrieved passages (debug) |
| POST | `/api/rag/ingest` | Re-ingest `backend/data/*.txt` |
| POST | `/api/rag/ingest/text` | Ingest an arbitrary pasted doc |
| GET | `/api/rag/stats` | Knowledge base statistics |

---

## 7. Architecture

```
frontend/  React+Tailwind  ──/api/*──►  backend/  Express
                                     ├─ services/aiService      (Ollama boundary)
                                     ├─ services/triageService  (Use Case 1)
                                     ├─ services/ragService     (Use Case 2)
                                     └─ config/db               (MySQL)
                                               ▲
                                    backend/data/*.txt  (knowledge base)
```

The Ollama model is isolated behind `aiService` (`generate` + `embed`). Swapping to another self-hosted provider (like vLLM or LM Studio) only requires changing that file.

---

## 8. Notes & Limitations

- Embeddings are stored as JSON arrays in MySQL; similarity is computed in Node (efficient for <1000 chunks)
- Switching the Ollama model requires re-running `npm run ingest` (embeddings are model-specific)
- The `ollama` service must be running for the app to function
- First model load may take 10-20 seconds as Ollama loads it into memory
- Subsequent requests are fast (typically 1-3 seconds for this model size)

---

## 9. Decision Rationale

See [DECISION_MEMO.md](./DECISION_MEMO.md) for detailed explanation of:
- Model choice (Qwen2.5-1.5B via Ollama)
- Quantization approach (Q4_K_M, balanced for CPU/GPU)
- Retrieval strategy (cosine similarity with keyword fallback)
- Hallucination mitigation (structured output validation, grounded answering with citations)
- Latency vs. hardware trade-offs (optimized for free-tier local execution)
- Assumptions made on ambiguous requirements

---

**Ready for evaluation?**  
1. Start Ollama (`ollama serve`)
2. Start backend (`npm run dev` in backend)
3. Ingest knowledge base (`npm run ingest` in backend)
4. Start frontend (`npm run dev` in frontend)
5. Visit http://localhost:5173 and demonstrate both features