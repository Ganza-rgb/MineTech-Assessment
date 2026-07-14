# Minetech Assessment — Open-Source LLM: Intake Triage + Knowledge Assistant

A full-stack app that serves an open-source LLM via free cloud inference (Hugging Face)
and builds two features on top of it — no OpenAI/Anthropic/Gemini, no money spent:

1. **Smart Intake Triage** — turn free-text tickets/feedback into validated,
   structured JSON (category, priority, extracted fields, drafted reply) shown
   in a filterable dashboard. Malformed model output is handled gracefully.
2. **Knowledge Assistant** — answer questions with a free open-source LLM. In cloud
   mode, answers come directly from the model for speed. In local mode, a RAG
   pipeline retrieves relevant chunks from a MySQL-backed knowledge base and grounds
   the answer with citations.

> **Stack:** Node + Express · React + Tailwind (Vite) · MySQL · Hugging Face
> Inference API (cloud) / Transformers.js ONNX (local fallback).

---

## 1. Prerequisites

- **Node.js 20+** and **npm**
- **MySQL** (local or remote). The app creates tables automatically on boot.
- A free [Hugging Face token](https://huggingface.co/settings/tokens) for cloud inference.
- Internet access for cloud mode. Local mode needs ~1 GB disk for model weights
  (cached after first download in `~/.cache/huggingface`).

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

Edit `backend/.env` and set your MySQL credentials (`MYSQL_HOST`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_DATABASE`). Defaults assume a local MySQL.

Key settings:

```ini
# Default mode: cloud (fast, no local model download)
LLM_MODE=cloud

# Cloud inference via Hugging Face
CLOUD_MODEL=Qwen/Qwen2.5-0.5B-Instruct
CLOUD_API_KEY=hf_...

# Local fallback (optional, requires @huggingface/transformers — already installed)
HF_MODEL_ID=onnx-community/Qwen2.5-0.5B-Instruct
HF_EMBED_MODEL_ID=Xenova/all-MiniLM-L6-v2
HF_DTYPE=q4
TRANSFORMERS_DEVICE=cpu
```

---

## 4. Run the app

```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — ingest the knowledge base into MySQL (run once)
npm run ingest

# Terminal 3 — frontend
cd ../frontend
npm run dev
```

Open the frontend URL (default http://localhost:5173).

### Cloud vs. Local

| Mode | How it works | When to use |
|------|--------------|-------------|
| `cloud` (default) | Calls Hugging Face Inference API for generation and embeddings. Fast, no local download. | Everyday use; needs internet + HF token |
| `local` | Loads ONNX weights via Transformers.js. Slower on CPU, works offline after first download. | Air-gapped environments; no HF token |
| `mock` | Deterministic heuristic responses. No model needed. | CI / smoke testing |

In **cloud mode**, the Knowledge Assistant answers directly from the model with topic restriction enforced via system prompt — fast, no retrieval overhead. In **local mode**, it runs full RAG retrieval over the MySQL-backed knowledge base with citations.

---

## 5. Use the features

### Smart Intake Triage
Paste a message (or click a *Sample*), hit **Run triage**. The structured JSON +
drafted reply appears, and the row lands in the filterable table. Filter by
category, priority, or status, or search by keyword. Change ticket status inline.

### Knowledge Assistant
Ask a question (or click a suggestion). The assistant runs RAG retrieval in both cloud and local modes:
- **Relevant docs found:** The answer is grounded in the matched passages, with citation indexes like `[1]` and `[2]` pointing to the source file.
- **No relevant docs:** The model refuses to answer off-topic questions (sports, politics, entertainment, etc.) and redirects the user to MineTech-related topics.

The assistant is restricted to MineTech operations, safety, technical support, billing, and account topics only.

To add your own documents, drop `.txt` / `.md` files into `backend/data/` and click
**Re-ingest KB** in the UI, or run:

```bash
cd backend
npm run ingest
```

---

## 6. API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Provider mode + KB stats |
| POST | `/api/triage` | Classify/extract/draft one message → JSON |
| GET | `/api/tickets` | List tickets (`?category&priority&status&q`) |
| PATCH | `/api/tickets/:id` | Update status |
| POST | `/api/rag/ask` | Answer + citations (cloud: fast, topic-restricted; local: grounded RAG) |
| POST | `/api/rag/retrieve` | Raw retrieved passages (debug, local only) |
| POST | `/api/rag/ingest` | Re-ingest `backend/data/*.txt` |
| POST | `/api/rag/ingest/text` | Ingest an arbitrary pasted doc |

---

## 7. Architecture

```
frontend/  React+Tailwind  ──/api/*──►  backend/  Express
                                     ├─ services/aiService      (model boundary)
                                     ├─ services/triageService  (Use Case 1)
                                     ├─ services/ragService     (Use Case 2)
                                     └─ config/db               (MySQL)
                                           ▲
                                    backend/data/*.txt  (knowledge base)
```

The model is isolated behind `aiService` (`generate` + `embed`). Swapping the
provider (e.g. to a GPU vLLM endpoint) touches only that file.

---

## 8. Notes & limitations

- Embeddings are stored as JSON arrays in MySQL; similarity is computed in Node
  (fine for small KBs). For scale, move to MySQL `VECTOR` (8.0.32+) or pgvector.
- Switching models requires re-running `npm run ingest` (embeddings are
  model-specific).
- The `mock` provider is heuristic-only and is **not** used for evaluation of the
  model; set `LLM_MODE=cloud` or `LLM_MODE=local` for the real path.

See `DECISION_MEMO.md` for the engineering rationale.
