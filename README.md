# Minetech Assessment — Self-Hosted LLM: Intake Triage + Knowledge Assistant

A full-stack app that serves an open-source LLM via **self-hosted Ollama** (no external APIs) and builds two features on top of it — no OpenAI/Anthropic/Gemini, no money spent. Designed for **MineTech Rwanda**, an AI-native ERP and deep-tech intelligence platform for African mining operations.

1. **Smart Intake Triage** — turn free-text field messages into validated, structured JSON (category, priority, extracted operational fields, drafted reply) shown in a filterable dashboard. Malformed model output is handled gracefully.
2. **Knowledge Assistant** — answer questions with a self-hosted open-source LLM. Retrieves relevant context from a MySQL-backed knowledge base and grounds the answer with citations. Clearly indicates when the answer is not in the knowledge base.

> **Stack:** Node + Express · React + Tailwind (Vite) · MySQL · **Ollama (self-hosted)**
>
> **Generation Model:** Llama 3.2 3B (via Ollama) — runs completely free on local hardware
>
> **Embedding Model:** nomic-embed-text (768-dim) — dedicated embedding model for RAG

---

## 1. Prerequisites

- **Node.js 20+** and **npm**
- **MySQL** (local or remote). The app creates tables automatically on boot.
- **Ollama** installed and running (https://ollama.com/download)
  - Pull the models:
    ```bash
    ollama pull llama3.2:3b
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
OLLAMA_MODEL=llama3.2:3b                 # Text generation model
OLLAMA_EMBED_MODEL=nomic-embed-text        # Embedding model (768-dim)

# Generation parameters
LLM_TEMP=0.7
LLM_MAX_TOKENS=256

# RAG Settings
RAG_CHUNK_SIZE=600
RAG_CHUNK_OVERLAP=100
RAG_TOP_K=4
RAG_SIM_THRESHOLD=0.2
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
3. View the answer with a clean response UI:
   - **Answer Layer** — Generated text with clear readability
   - **Citation Pills Layer** — Horizontal row of rounded badges with document icons
   - **Fallback State** — Neutral gray bubble when answer is not in the knowledge base
4. If the question is outside the knowledge base:
   - Shows a muted fallback response: "I don't have info about that."
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
│  │  - Filterable table │    │    - Clean citation pills      │ │
│  │  - Status workflow  │    │    - Neutral fallback state    │ │
│  │  - JSON inspector   │    │    - Hover citation tooltips   │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express + Node.js)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ aiService    │  │ triageService│  │ ragService (MySQL)    │   │
│  │ - generate() │  │ - parse JSON │  │ - cosineSimilarity() │   │
│  │ - embed()    │  │ - self-heal  │  │ - chunking + ingest  │   │
│  └──────────────┘  └──────────────┘  └───────────────────────┘   │
│                              │                                   │
│                     ┌─────────┴──────────────────────────┐      │
│                     │            DATA LAYER             │      │
│                     │  ┌─────────────────────────────┐   │      │
│                     │  │          MySQL              │   │      │
│                     │  │  (tickets + chunks/vectors) │   │      │
│                     │  └─────────────────────────────┘   │      │
│                     └────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OLLAMA (Self-Hosted)                        │
│  ┌──────────────────────────┐  ┌────────────────────────────┐  │
│  │ llama3.2:3b              │  │ nomic-embed-text           │  │
│  │ - Text generation        │  │ - 768-dim embeddings       │  │
│  │ - Structured JSON       │  │ - Semantic search          │  │
│  │ - System prompts        │  │ - Vector similarity       │  │
│  └──────────────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**RAG Query Flow:**
```
User Query → nomic-embed-text → MySQL Cosine Similarity → Top-K Chunks → 
Llama 3.2 3B + Context → Grounded Answer with Citations → Frontend Display
```

---

## 8. Senior-Level RAG Features Implemented

### Hallucination Prevention
- **Relevance Gate**: similarity threshold (0.2) filters out low-quality matches
- **Closed-Domain Prompt**: Model restricted to ONLY use provided context
- **"Don't Know" Fallback**: Explicit response when no relevant context found
- **Citations**: Verifiable source document pills

### Self-Healing JSON Parsing
- Triage service handles malformed LLM output gracefully
- Fallback to heuristic classifiers when JSON parsing fails

---

## 9. Notes & Limitations

- **MySQL** stores both triage tickets and RAG chunk embeddings (JSON columns)
- **Ollama** serves both the generation model (`llama3.2:3b`) and the embedding model (`nomic-embed-text`)
- The `ollama` service must be running for the app to function
- First model load may take 10-20 seconds as Ollama loads it into memory
- Subsequent requests are fast (typically 1-3 seconds for this model size)

---

## 10. Decision Rationale

See [DECISION_MEMO.md](./DECISION_MEMO.md) for detailed explanation of:
- Model choice (Llama 3.2 3B via Ollama)
- Embedding model (nomic-embed-text via Ollama)
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