# Minetech Assessment — Self-hosted LLM: Intake Triage + RAG KB

A full-stack app that **serves an open-source LLM locally (Hugging Face, via
Transformers.js)** and builds two features on top of that single model — no
OpenAI/Anthropic/Gemini, no money spent:

1. **Smart Intake Triage** — turn free-text tickets/feedback into validated,
   structured JSON (category, priority, extracted fields, drafted reply) shown
   in a filterable dashboard. Malformed model output is handled gracefully.
2. **Grounded Knowledge Assistant (RAG)** — answer questions over a local
   knowledge base with citations, and explicitly say when the answer is *not*
   in the knowledge base. Simple chat UI.

> **Stack:** Node + Express · React + Tailwind (Vite) · MySQL · Hugging Face
> `transformers` (ONNX) running on your machine.

---

## 1. Prerequisites

- **Node.js 20+** and **npm**
- **MySQL** (local or cPanel/remote). Create the database; the app creates
  tables automatically on boot.
- ~1 GB free disk for the default model weights (cached after first download).
- Internet on **first run only** — model weights are downloaded from the Hugging
  Face Hub, then cached in `~/.cache/huggingface`.

## 2. Install

```bash
# backend
cd backend
npm install          # pure-JS deps; mock mode works with no model download

# frontend
cd ../frontend
npm install          # Tailwind is loaded via the Play CDN (see index.html) —
                     # no native build step, so it runs even where
                     # @tailwindcss/oxide fails to install
```

## 3. Configure

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set your MySQL credentials (`MYSQL_HOST`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_DATABASE`). Defaults assume a local MySQL.

> **Offline / no-download mode (default):** `LLM_MODE=mock` runs a deterministic
> provider so the **entire app works without downloading a model**. Great for a
> quick smoke test and for CI.

## 4. Run the model + app end-to-end

```bash
# Terminal 1 — backend (loads the self-hosted model on first request)
cd backend
npm run dev

# Terminal 2 — ingest the knowledge base into MySQL (run once)
npm run ingest

# Terminal 3 — frontend
cd ../frontend
npm run dev
```

Open the frontend URL (default http://localhost:5173). The header pill shows
`LLM: self-hosted` when the real model is active, or `LLM: offline mock`
otherwise.

### Use the real self-hosted model
Install the model runtime (pulls a native ONNX binary; optional — skip for mock mode),
then set in `backend/.env`:

```bash
cd backend
npm i @huggingface/transformers
```

```ini
LLM_MODE=hf
HF_MODEL_ID=onnx-community/Qwen2.5-0.5B-Instruct   # or 1.5B for better quality
HF_EMBED_MODEL_ID=Xenova/all-MiniLM-L6-v2
HF_DTYPE=q4
TRANSFORMERS_DEVICE=cpu     # or webgpu / wasm if available
```

Then restart the backend. The first request downloads the weights (one-time).

### Demo the two use cases
- **Triage:** paste a message (or click a *Sample*), hit *Run triage*. The
  structured JSON + drafted reply appears, and the row lands in the filterable
  table (filter by category / priority / status, search, change status).
- **RAG:** ask a question (or click a suggestion). Answers cite source sections
  `[1] [2]`; out-of-scope questions return a clear *Not in knowledge base*
  response with no citations.

## 5. API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Provider mode + KB stats |
| POST | `/api/triage` | Classify/extract/draft one message → JSON |
| GET | `/api/tickets` | List tickets (`?category&priority&status&q`) |
| PATCH | `/api/tickets/:id` | Update status |
| POST | `/api/rag/ask` | Grounded answer + citations |
| POST | `/api/rag/retrieve` | Raw retrieved passages (debug) |
| POST | `/api/rag/ingest` | Re-ingest `backend/data/*.txt` |
| POST | `/api/rag/ingest/text` | Ingest an arbitrary pasted doc |

## 6. Architecture

```
frontend/  React+Tailwind  ──/api/*──►  backend/  Express
                                    ├─ services/aiService      (HF model boundary)
                                    ├─ services/triageService  (Use Case 1)
                                    ├─ services/ragService     (Use Case 2)
                                    └─ config/db               (MySQL)
                                          ▲
                                   backend/data/*.txt  (knowledge base)
```

The model is isolated behind `aiService` (`generate` + `embed`). Swapping the
provider (e.g. to a GPU vLLM endpoint) touches only that file.

## 7. Notes & limitations
- Embeddings are stored as JSON arrays in MySQL; similarity is computed in Node
  (fine for small KBs). For scale, move to MySQL `VECTOR` (8.0.32+) or pgvector.
- Switching models requires re-running `npm run ingest` (embeddings are
  model-specific).
- The `mock` provider is heuristic-only and is **not** used for evaluation of the
  model; set `LLM_MODE=hf` for the real self-hosted path.

See `DECISION_MEMO.md` for the engineering rationale.
