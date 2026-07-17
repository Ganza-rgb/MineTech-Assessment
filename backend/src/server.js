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
import { requestIdMiddleware, createLogger } from './middleware/logger.js';
import {
  TriageRequestSchema,
  RagAskSchema,
  RagIngestTextSchema,
  TicketUpdateSchema,
  RagRetrieveSchema,
} from './middleware/validation.js';

const logger = createLogger();

preloadAI();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);

/* ---- health ----------------------------------------------------- */
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  let aiHealth = { ready: false, mode: config.llm.mode, model: 'loading...' };
  try {
    const ai = await getAI();
    aiHealth = await ai.health();
  } catch {
    // AI not ready yet; return loading state
  }
  const stats = await knowledgeStats().catch(() => ({ documents: 0, chunks: 0 }));
  const duration = Date.now() - start;
  logger.info('health check', { reqId: req.id, mode: aiHealth.mode, duration });
  res.json({ status: 'ok', ai: aiHealth, knowledge: stats });
});

/* ---- Use Case 1: Triage ---------------------------------------- */
app.post('/api/triage', async (req, res) => {
  const start = Date.now();
  try {
    const parsed = TriageRequestSchema.parse(req.body);
    const result = await triage(parsed.text, { source: parsed.source || 'api' });

    // Try to save to MySQL if available
    if (pool) {
      try {
        const [ins] = await pool.query(
          `INSERT INTO tickets
            (raw_text, category, priority, priority_reason, sentiment, language,
             key_entities, summary, suggested_reply, confidence, status, source, meta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
          [
            parsed.text,
            result.category,
            result.priority,
            result.priority_reason,
            result.sentiment,
            result.language,
            JSON.stringify(result.key_entities || {}),
            result.summary,
            result.suggested_reply,
            result.confidence,
            parsed.source || 'api',
            JSON.stringify(result.meta || {}),
          ]
        );
        const duration = Date.now() - start;
        logger.info('triage created', { reqId: req.id, ticketId: ins.insertId, category: result.category, duration });
        return res.json({ id: ins.insertId, ...result });
      } catch (dbErr) {
        logger.warn('triage save to MySQL failed, returning result only', { error: dbErr.message });
      }
    }

    // Return result without saving to DB
    const duration = Date.now() - start;
    logger.info('triage completed (no DB)', { reqId: req.id, category: result.category, duration });
    res.json({ id: null, ...result });
  } catch (err) {
    if (err.name === 'ZodError') {
      logger.warn('triage validation failed', { reqId: req.id, errors: err.errors });
      return res.status(400).json({ error: 'validation failed', detail: err.errors.map(e => e.message).join(', ') });
    }
    logger.error('triage failed', { reqId: req.id, error: err.message });
    res.status(500).json({ error: 'triage failed', detail: err.message });
  }
});

app.get('/api/tickets', async (req, res) => {
  const start = Date.now();
  try {
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
    const duration = Date.now() - start;
    logger.info('tickets listed', { reqId: req.id, count: rows.length, duration });
    res.json(rows.map((r) => ({ ...r, key_entities: safeJson(r.key_entities), meta: safeJson(r.meta) })));
  } catch (err) {
    logger.error('tickets list failed', { reqId: req.id, error: err.message });
    res.status(500).json({ error: 'tickets list failed', detail: err.message });
  }
});

app.patch('/api/tickets/:id', async (req, res) => {
  const start = Date.now();
  try {
    const parsed = TicketUpdateSchema.parse(req.body);
    await pool.query('UPDATE tickets SET status = ? WHERE id = ?', [parsed.status, req.params.id]);
    const duration = Date.now() - start;
    logger.info('ticket updated', { reqId: req.id, ticketId: req.params.id, status: parsed.status, duration });
    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'ZodError') {
      logger.warn('ticket update validation failed', { reqId: req.id, errors: err.errors });
      return res.status(400).json({ error: 'validation failed', detail: err.errors.map(e => e.message).join(', ') });
    }
    logger.error('ticket update failed', { reqId: req.id, error: err.message });
    res.status(500).json({ error: 'ticket update failed', detail: err.message });
  }
});

/* ---- Use Case 2: RAG ------------------------------------------- */
app.post('/api/rag/ask', async (req, res) => {
  const start = Date.now();
  try {
    const parsed = RagAskSchema.parse(req.body);
    const result = await answer(parsed.question);
    const duration = Date.now() - start;
    logger.info('rag ask', { reqId: req.id, questionLength: parsed.question.length, grounded: result.grounded, duration });
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      logger.warn('rag ask validation failed', { reqId: req.id, errors: err.errors });
      return res.status(400).json({ error: 'validation failed', detail: err.errors.map(e => e.message).join(', ') });
    }
    logger.error('rag ask failed', { reqId: req.id, error: err.message });
    res.status(500).json({ error: 'rag failed', detail: err.message });
  }
});

app.post('/api/rag/retrieve', async (req, res) => {
  const start = Date.now();
  try {
    const parsed = RagRetrieveSchema.parse(req.body);
    const result = await retrieve(parsed.question);
    const duration = Date.now() - start;
    logger.info('rag retrieve', { reqId: req.id, questionLength: parsed.question.length, results: result.results.length, duration });
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      logger.warn('rag retrieve validation failed', { reqId: req.id, errors: err.errors });
      return res.status(400).json({ error: 'validation failed', detail: err.errors.map(e => e.message).join(', ') });
    }
    logger.error('rag retrieve failed', { reqId: req.id, error: err.message });
    res.status(500).json({ error: 'retrieve failed', detail: err.message });
  }
});

app.post('/api/rag/ingest', async (req, res) => {
  const start = Date.now();
  try {
    const results = await ingestAll();
    const duration = Date.now() - start;
    logger.info('rag ingest all', { reqId: req.id, files: results.length, duration });
    res.json({ ok: true, ingested: results });
  } catch (err) {
    logger.error('rag ingest failed', { reqId: req.id, error: err.message });
    res.status(500).json({ error: 'ingest failed', detail: err.message });
  }
});

app.post('/api/rag/ingest/text', async (req, res) => {
  const start = Date.now();
  try {
    const parsed = RagIngestTextSchema.parse(req.body);
    const tmp = path_tmp(parsed.title, parsed.content);
    try {
      const r = await ingestFile(tmp);
      const duration = Date.now() - start;
      logger.info('rag ingest text', { reqId: req.id, title: parsed.title, chunks: r.chunks, duration });
      res.json({ ok: true, ...r });
    } finally {
      fs.unlinkSync(tmp);
    }
  } catch (err) {
    if (err.name === 'ZodError') {
      logger.warn('rag ingest text validation failed', { reqId: req.id, errors: err.errors });
      return res.status(400).json({ error: 'validation failed', detail: err.errors.map(e => e.message).join(', ') });
    }
    logger.error('rag ingest text failed', { reqId: req.id, error: err.message });
    res.status(500).json({ error: 'ingest failed', detail: err.message });
  }
});

app.get('/api/rag/stats', async (req, res) => {
  const start = Date.now();
  res.json(await knowledgeStats().catch(() => ({ documents: 0, chunks: 0 })));
  const duration = Date.now() - start;
  logger.info('rag stats', { reqId: req.id, duration });
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.listen(config.port, () => logger.info('server started', { port: config.port }));

// Non-blocking MySQL init (needed for triage, but RAG works without it)
(async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      await initSchema();
      logger.info('db schema ready');
      return;
    } catch (err) {
      // Don't block server startup - RAG works without MySQL
      if (attempt === 1) {
        logger.warn('MySQL not available, triage features disabled', { error: err.message });
      }
      // Stop retrying after first failure to avoid spam
      return;
    }
  }
})();
