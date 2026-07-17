# Minetech Assessment — Self-Hosted LLM: Intake Triage + Knowledge Assistant

A full-stack app that serves an open-source LLM via **self-hosted Ollama** (no external APIs) and builds two features on top of it — no OpenAI/Anthropic/Gemini, no money spent:

1. **Smart Intake Triage** — turn free-text tickets/feedback into validated, structured JSON (category, priority, extracted fields, drafted reply) shown in a filterable dashboard. Malformed model output is handled gracefully.
2. **Knowledge Assistant** — answer questions with a self-hosted open-source LLM. Retrieves relevant context from a LanceDB-backed knowledge base and grounds the answer with citations. Clearly indicates when the answer is not in the knowledge base.

> **Stack:** Node + Express · React + Tailwind (Vite) · MySQL · **Ollama (self-hosted)** · **LanceDB**
>
> **Generation Model:** Qwen2.5-0.5B (via Ollama) — runs completely free on local hardware
>
> **Embedding Model:** nomic-embed-text (768-dim) — dedicated embedding model for RAG

---

## 1. Prerequisites

- **Node.js 20+** and **npm**
- **MySQL** (local or remote). The app creates tables automatically on boot.
- **Ollama** installed and running (https://ollama.com/download)
  - Pull the models:
    ```bash
    ollama pull qwen2.5:0.5b
    ollama pull nomic-embed-text
    ```
  - Verify they're running: `ollama list` should show both models

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

Edit `backend/.env` and set your MySQL credentials. Key settings:

```ini
# Server
PORT=4000

# MySQL (update with your credentials)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=1234
MYSQL_DATABASE=minetech

# LLM Mode - ONLY OLLAMA (self-hosted, no external APIs)
LLM_MODE=ollama

# Ollama Settings
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=qwen2.5:0.5b                 # Text generation model
OLLAMA_EMBED_MODEL=nomic-embed-text        # Embedding model (768-dim)

# Generation parameters
LLM_TEMP=0.1                              # Low temp for factual consistency
LLM_MAX_TOKENS=256

# RAG Settings (LanceDB)
RAG_CHUNK_SIZE=600
RAG_CHUNK_OVERLAP=100
RAG_TOP_K=5
RAG_SIM_THRESHOLD=0.15                    # Minimum similarity threshold
```

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

### Knowledge Assistant (RAG)
1. Switch to the Knowledge Assistant tab
2. Ask a question about MineTech operations, safety, technical support, billing, or account access
3. View the answer with the **4-Layer Response Design**:
   - **Answer Layer** — Generated text with inline citation markers [1], [2]
   - **Citation Labels Layer** — Clickable chips showing source documents
   - **Context Preview Dropdown** — Toggle to see raw source chunks from LanceDB
   - **Trace Metadata Layer** — Latency, confidence score, grounded status
4. If the question is outside the knowledge base:
   - Shows "Not in Knowledge Base" warning banner
   - `grounded: false` indicator
   - No citations displayed
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
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Tailwind)              │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │  Triage Dashboard   │    │    Knowledge Assistant (RAG)   │ │
│  │  - Filterable table │    │    - 4-Layer Response UI        │ │
│  │  - Status workflow  │    │    - Citation chips             │ │
│  │  - JSON inspector   │    │    - Context dropdown           │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express + Node.js)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ aiService    │  │ triageService│  │ ragService (LanceDB) │   │
│  │ - generate() │  │ - parse JSON │  │ - vectorSearch()     │   │
│  │ - embed()    │  │ - self-heal  │  │ - cosineSimilarity()│   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
│                              │              │                    │
│                     ┌─────────┴──────────────┴──────────────┐    │
│                     │            DATA LAYER                 │    │
│                     │  ┌─────────────┐  ┌───────────────┐   │    │
│                     │  │   MySQL     │  │   LanceDB    │   │    │
│                     │  │ (tickets)   │  │  (vectors)    │   │    │
│                     │  └─────────────┘  └───────────────┘   │    │
│                     └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OLLAMA (Self-Hosted)                        │
│  ┌──────────────────────────┐  ┌────────────────────────────┐  │
│  │ qwen2.5:0.5b             │  │ nomic-embed-text           │  │
│  │ - Text generation        │  │ - 768-dim embeddings       │  │
│  │ - Structured JSON       │  │ - Semantic search          │  │
│  │ - System prompts        │  │ - Vector similarity       │  │
│  └──────────────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**RAG Query Flow:**
```
User Query → nomic-embed-text → LanceDB Vector Search → Top-K Chunks → 
Qwen2.5 + Context → Grounded Answer with Citations → Frontend Display
```

---

## 8. Senior-Level RAG Features Implemented

### Hallucination Prevention
- **Relevance Gate**: similarity threshold (0.15) filters out low-quality matches
- **Closed-Domain Prompt**: Model restricted to ONLY use provided context
- **"Don't Know" Fallback**: Explicit response when no relevant context found
- **Citation Validation**: Verifies model cites sources correctly

### Data Verification (4-Layer UI)
1. **Answer Layer** — Text with inline [1], [2] footnotes
2. **Citation Labels** — Clickable source document chips
3. **Context Preview** — Collapsible raw source chunks
4. **Trace Metadata** — Latency, confidence, grounded status

### Self-Healing JSON Parsing
- Triage service handles malformed LLM output gracefully
- Fallback to heuristic classifiers when JSON parsing fails

---

## 9. Notes & Limitations

- **LanceDB** stores vector embeddings (simpler than MySQL for vectors)
- **MySQL** stores triage tickets (relational data)
- Switching the Ollama model requires re-running `npm run ingest`
- The `ollama` service must be running for the app to function
- First model load may take 10-20 seconds as Ollama loads it into memory
- Subsequent requests are fast (typically 1-3 seconds for this model size)

---

## 10. Decision Rationale

See [DECISION_MEMO.md](./DECISION_MEMO.md) for detailed explanation of:
- Model choice (Qwen2.5-0.5B via Ollama)
- Embedding model (nomic-embed-text)
- LanceDB for vector storage (serverless, file-based)
- Retrieval strategy (cosine similarity with threshold filtering)
- Hallucination mitigation (strict prompting, relevance gating)
- Latency vs. hardware trade-offs (optimized for free-tier local execution)

---

**Ready for evaluation?**  
1. Start Ollama (`ollama serve`)
2. Start backend (`npm run dev` in backend)
3. Ingest knowledge base (`npm run ingest` in backend)
4. Start frontend (`npm run dev` in frontend)
5. Visit http://localhost:5173 and demonstrate both features