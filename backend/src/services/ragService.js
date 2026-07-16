import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/config.js';
import { pool } from '../config/db.js';
import { getAI, getMode } from './aiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

/* ---- Load system instructions ------------------------------------ */

let SYSTEM_INSTRUCTIONS = `You are a support assistant for MineTech, a mining technology company.
You answer ONLY questions about MineTech operations, safety protocols, technical support, billing, account access, and company policies.
If the user asks about sports, politics, entertainment, cooking, or any topic unrelated to MineTech, politely refuse and redirect them to MineTech-related topics.
Use "We" and "Our team", not "I". Be concise, professional, and grounded in the provided context when available.`;

function loadSystemInstructions() {
  const instPath = path.join(DATA_DIR, 'system-instructions.md');
  if (fs.existsSync(instPath)) {
    try {
      const content = fs.readFileSync(instPath, 'utf8');
      SYSTEM_INSTRUCTIONS = content;
    } catch (e) {
      console.warn('[rag] Could not load system instructions:', e.message);
    }
  }
}
loadSystemInstructions();

/* ---- chunking --------------------------------------------------- */

export function chunkText(text, size = config.rag.chunkSize, overlap = config.rag.chunkOverlap) {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const next = clean.slice(start, end);
      const lastBreak = Math.max(next.lastIndexOf('\n\n'), next.lastIndexOf('. '));
      if (lastBreak > size * 0.4) end = start + lastBreak + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end === clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter((c) => c.length > 0);
}

/* ---- ingestion (parallel) --------------------------------------- */

export async function ingestFile(filePath) {
  const ai = await getAI();
  const title = path.basename(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const chunks = chunkText(text);
  if (chunks.length === 0) return { title, chunks: 0 };

  const conn = await pool.getConnection();
  try {
    const [doc] = await conn.query(
      'INSERT INTO documents (title, source) VALUES (?, ?)',
      [title, filePath]
    );
    const documentId = doc.insertId;

    // Parallel embedding + insertion
    const embedPromises = chunks.map(async (chunk, i) => {
      const embedding = await ai.embed(chunk);
      return { index: i, chunk, embedding };
    });

    const results = await Promise.all(embedPromises);

    // Parallel database insertion
    const insertPromises = results.map(({ index, chunk, embedding }) =>
      conn.query(
        'INSERT INTO chunks (document_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)',
        [documentId, index, chunk, embedding ? JSON.stringify(embedding) : null]
      )
    );

    await Promise.all(insertPromises);
    return { title, chunks: chunks.length };
  } finally {
    conn.release();
  }
}

export async function ingestAll() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith('.txt') || f.toLowerCase().endsWith('.md'))
    .map((f) => path.join(DATA_DIR, f));
  const results = [];
  for (const f of files) results.push(await ingestFile(f));
  return results;
}

/* ---- retrieval (optimized) -------------------------------------- */

function cosine(a, b) {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

function tokenize(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

export async function retrieve(query, topK = config.rag.topK) {
  const [rows] = await pool.query(
    `SELECT c.id, c.document_id, c.chunk_index, c.content, c.embedding, d.title
     FROM chunks c JOIN documents d ON d.id = c.document_id
     LIMIT 100`
  );
  if (rows.length === 0) return { results: [], relevant: [], queryEmbedding: null };

  const ai = await getAI();
  const queryEmbedding = await ai.embed(query);
  let scored = [];

  if (queryEmbedding) {
    scored = rows.map((r) => {
      const emb = typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding;
      return {
        id: r.id,
        document_id: r.document_id,
        document: r.title,
        chunk_index: r.chunk_index,
        content: r.content,
        cosine: cosine(queryEmbedding, emb),
      };
    });
  } else {
    const terms = tokenize(query);
    scored = rows.map((r) => {
      const tokens = tokenize(r.content);
      const matches = terms.filter((t) => tokens.includes(t)).length;
      return {
        id: r.id,
        document_id: r.document_id,
        document: r.title,
        chunk_index: r.chunk_index,
        content: r.content,
        cosine: terms.length ? matches / terms.length : 0,
      };
    });
  }

  scored.sort((a, b) => b.cosine - a.cosine);
  const relevant = scored.filter((s) => s.cosine >= config.rag.similarityThreshold);

  return {
    results: scored.slice(0, topK).map((s, i) => ({ ...s, rank: i + 1 })),
    relevant: scored.filter((s) => s.cosine >= config.rag.similarityThreshold).slice(0, topK),
    queryEmbedding: queryEmbedding || null,
  };
}

/* ---- answer (fast cloud path + grounded local fallback) --------- */

export async function answer(query) {
  const ai = await getAI();
  const mode = getMode();

  if (mode === 'cloud') {
    const modelOut = await ai.generate({
      system: SYSTEM_INSTRUCTIONS,
      prompt: query,
      temperature: 0.7,
    });

    return {
      content: modelOut.trim(),
      citations: [],
      grounded: false,
      confidence: 0,
      provider: mode,
    };
  }

  const { relevant } = await retrieve(query);

  let systemPrompt = SYSTEM_INSTRUCTIONS;
  let modelOut;
  let citations = [];
  let grounded = false;
  let confidence = 0;

  if (relevant.length > 0) {
    const context = relevant
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');

    systemPrompt = `${SYSTEM_INSTRUCTIONS}\n\nWhen answering, cite your sources using the format [1], [2], etc. based on the provided context.\n\nRelevant information:\n${context}`;

    console.log('RAG SYSTEM PROMPT:', systemPrompt);
    console.log('RAG QUESTION:', query);
    modelOut = await ai.generate({
      system: systemPrompt,
      prompt: query,
      temperature: 0.7,
    });
    console.log('RAG MODEL OUTPUT:', modelOut);

    const usedCitations = [];
    relevant.forEach((r, i) => {
      if (new RegExp(`\\[${i + 1}\\]`).test(modelOut)) {
        usedCitations.push({
          index: i + 1,
          document: r.document,
          chunk_id: r.id,
          snippet: r.content.slice(0, 150)
        });
      }
    });
    citations = usedCitations;
    grounded = citations.length > 0;
    confidence = Number(relevant[0].cosine.toFixed(3));
  } else {
    console.log('RAG SYSTEM PROMPT:', SYSTEM_INSTRUCTIONS);
    console.log('RAG QUESTION:', query);
    modelOut = await ai.generate({
      system: SYSTEM_INSTRUCTIONS,
      prompt: query,
      temperature: 0.7,
    });
    console.log('RAG MODEL OUTPUT:', modelOut);
    confidence = 0;
  }

  return {
    content: modelOut.trim(),
    citations,
    grounded,
    confidence,
    provider: mode,
  };
}

export async function knowledgeStats() {
  try {
    const [docs] = await pool.query('SELECT COUNT(*) AS n FROM documents');
    const [chunks] = await pool.query('SELECT COUNT(*) AS n FROM chunks');
    return { documents: docs[0].n, chunks: chunks[0].n };
  } catch {
    return { documents: 0, chunks: 0 };
  }
}

/* ---- CLI -------------------------------------------------------- */

if (process.argv[2] === 'ingest') {
  const { initSchema } = await import('../config/db.js');
  await initSchema();
  const res = await ingestAll();
  console.log('Ingested:');
  for (const r of res) console.log(`  - ${r.title}: ${r.chunks} chunks`);
  process.exit(0);
}