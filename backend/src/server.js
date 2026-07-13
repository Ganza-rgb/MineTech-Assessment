import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config/config.js';
import { pool, initSchema } from './config/db.js';
import { getAI, preloadAI } from './services/aiService.js';
import { triage } from './services/triageService.js';
import {
  answer,
  ingestAll,
  ingestFile,
  knowledgeStats,
  retrieve,
} from './services/ragService.js';

preloadAI();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* ---- health ----------------------------------------------------- */
app.get('/api/health', async (_req, res) => {
  let aiHealth = { ready: false, mode: config.llm.mode, model: 'loading...' };
  try {
    const ai = await getAI();
    aiHealth = await ai.health();
  } catch {
    // AI not ready yet; return loading state
  }
  const stats = await knowledgeStats().catch(() => ({ documents: 0, chunks: 0 }));
  res.json({ status: 'ok', ai: aiHealth, knowledge: stats });
});

/* ---- Use Case 1: Triage ---------------------------------------- */
app.post('/api/triage', async (req, res) => {
  const text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  try {
    const result = await triage(text, { source: req.body?.source || 'api' });
    const [ins] = await pool.query(
      `INSERT INTO tickets
        (raw_text, category, priority, priority_reason, sentiment, language,
         key_entities, summary, suggested_reply, confidence, status, source, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
      [
        text,
        result.category,
        result.priority,
        result.priority_reason,
        result.sentiment,
        result.language,
        JSON.stringify(result.key_entities || {}),
        result.summary,
        result.suggested_reply,
        result.confidence,
        result.meta?.source || 'api',
        JSON.stringify(result.meta || {}),
      ]
    );
    res.json({ id: ins.insertId, ...result });
  } catch (err) {
    console.error('[triage]', err);
    res.status(500).json({ error: 'triage failed', detail: err.message });
  }
});

app.get('/api/tickets', async (req, res) => {
  const { category, priority, status, q } = req.query;
  const where = [];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (priority) { where.push('priority = ?'); params.push(priority); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (q) { where.push('(raw_text LIKE ? OR summary LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const sql = `SELECT * FROM tickets
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT 200`;
  const [rows] = await pool.query(sql, params);
  res.json(rows.map((r) => ({ ...r, key_entities: safeJson(r.key_entities), meta: safeJson(r.meta) })));
});

app.patch('/api/tickets/:id', async (req, res) => {
  const status = req.body?.status;
  if (!status) return res.status(400).json({ error: 'status required' });
  await pool.query('UPDATE tickets SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
});

/* ---- Use Case 2: RAG ------------------------------------------- */
app.post('/api/rag/ask', async (req, res) => {
  const question = (req.body?.question || '').toString().trim();
  if (!question) return res.status(400).json({ error: 'question is required' });
  try {
    res.json(await answer(question));
  } catch (err) {
    console.error('[rag]', err);
    res.status(500).json({ error: 'rag failed', detail: err.message });
  }
});

// Return raw retrieved passages (useful for debugging / transparency).
app.post('/api/rag/retrieve', async (req, res) => {
  const question = (req.body?.question || '').toString().trim();
  if (!question) return res.status(400).json({ error: 'question is required' });
  res.json(await retrieve(question));
});

app.post('/api/rag/ingest', async (_req, res) => {
  try {
    const results = await ingestAll();
    res.json({ ok: true, ingested: results });
  } catch (err) {
    res.status(500).json({ error: 'ingest failed', detail: err.message });
  }
});

// Ingest an arbitrary pasted document (demo / live KB growth).
app.post('/api/rag/ingest/text', async (req, res) => {
  const { title, content } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  const tmp = path_tmp(title, content);
  try {
    const r = await ingestFile(tmp);
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: 'ingest failed', detail: err.message });
  } finally {
    fs.unlinkSync(tmp);
  }
});

app.get('/api/rag/stats', async (_req, res) => {
  res.json(await knowledgeStats().catch(() => ({ documents: 0, chunks: 0 })));
});

/* ---- helpers ---------------------------------------------------- */
function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return v; }
}
function path_tmp(title, content) {
  const p = path.join(os.tmpdir(), `${Date.now()}-${title.replace(/\W+/g, '_')}.txt`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

/* ---- boot ------------------------------------------------------- */
const FRONTEND_DIST = path.resolve('../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    }
    next();
  });
}

// Boot the HTTP server first so the app is always reachable, then bring up
// the DB schema with retries. This keeps the server alive even if MySQL is
// slow to start or creds are wrong — /api/health reports the real state.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.listen(config.port, () => console.log(`[server] listening on :${config.port}`));

(async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      await initSchema();
      console.log('[db] schema ready');
      return;
    } catch (err) {
      if (attempt === 1 || attempt % 10 === 0) {
        console.warn(`[db] not ready (${err.message}); retrying in 5s`);
      }
      await sleep(5000);
    }
  }
})();
