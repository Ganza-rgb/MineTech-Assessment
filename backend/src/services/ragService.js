import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/config.js';
import { pool } from '../config/db.js';
import { getAI } from './aiService.js';

/**
 * Use Case 2 — Grounded Knowledge Assistant (RAG).
 *
 * Pipeline:
 *   ingest()  : chunk knowledge-base docs -> embed -> store in MySQL
 *   retrieve(): lexical (BM25) + semantic (embedding cosine) blended retrieval
 *   answer()  : ground the model in retrieved [n] contexts, require citations,
 *               and explicitly report when the answer is NOT in the KB.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

/* ---- chunking --------------------------------------------------- */

export function chunkText(text, size = config.rag.chunkSize, overlap = config.rag.chunkOverlap) {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // break on sentence/paragraph boundary for cleaner context windows
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

/* ---- ingestion -------------------------------------------------- */

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
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await ai.embed(chunks[i]);
      await conn.query(
        'INSERT INTO chunks (document_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?)',
        [documentId, i, chunks[i], JSON.stringify(embedding)]
      );
    }
    return { title, chunks: chunks.length };
  } finally {
    conn.release();
  }
}

export async function ingestAll() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .map((f) => path.join(DATA_DIR, f));
  const results = [];
  for (const f of files) results.push(await ingestFile(f));
  return results;
}

/* ---- retrieval (BM25 + semantic blend) -------------------------- */

function cosine(a, b) {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // inputs are L2-normalized
}

function tokenize(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function bm25Scores(query, docs, k1 = 1.5, b = 0.75) {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return docs.map(() => 0);
  const N = docs.length;
  const lengths = docs.map((d) => d.tokens.length);
  const avgdl = lengths.reduce((s, l) => s + l, 0) / (N || 1);
  const df = {};
  for (const t of qTokens) {
    df[t] = docs.filter((d) => d.tokens.includes(t)).length;
  }
  return docs.map((d) => {
    let score = 0;
    const freq = {};
    for (const t of d.tokens) freq[t] = (freq[t] || 0) + 1;
    for (const t of qTokens) {
      const n = df[t];
      if (!n) continue;
      const f = freq[t] || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.tokens.length / (avgdl || 1)))));
    }
    return score;
  });
}

export async function retrieve(query, topK = config.rag.topK) {
  const [rows] = await pool.query(
    `SELECT c.id, c.document_id, c.chunk_index, c.content, c.embedding, d.title
     FROM chunks c JOIN documents d ON d.id = c.document_id`
  );
  if (rows.length === 0) return { results: [], queryEmbedding: null };

  const ai = await getAI();
  const queryEmbedding = await ai.embed(query);

  const docs = rows.map((r) => ({
    ...r,
    embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding,
    tokens: tokenize(r.content),
  }));

  const cos = docs.map((d) => cosine(queryEmbedding, d.embedding));
  const bm25 = bm25Scores(query, docs);
  const maxBm25 = Math.max(...bm25, 0) || 1;

  const scored = docs.map((d, i) => ({
    id: d.id,
    document_id: d.document_id,
    document: d.title,
    chunk_index: d.chunk_index,
    content: d.content,
    cosine: cos[i],
    bm25: bm25[i],
    score: (1 - config.rag.lexicalWeight) * cos[i] + config.rag.lexicalWeight * (bm25[i] / maxBm25),
  }));

  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.filter((s) => s.cosine >= config.rag.similarityThreshold);
  return {
    results: scored.slice(0, topK).map((s, i) => ({ ...s, rank: i + 1 })),
    relevant: relevant.slice(0, topK),
    queryEmbedding,
  };
}

/* ---- grounded answer -------------------------------------------- */

const ANSWER_SYSTEM = `You are a grounded knowledge-base assistant.
Answer the user's question using ONLY the numbered context passages below.
Rules:
- Cite the passages you used inline as [1], [2], etc.
- If the context does not contain the answer, say exactly: "I don't have information about that in the knowledge base."
- Do not use any knowledge outside the provided passages.
- Be concise and factual.`;

export async function answer(query) {
  const ai = await getAI();
  const { relevant, results } = await retrieve(query);

  const hasStrongMatch = relevant.length > 0 && relevant[0].cosine >= 0.35;

  if (hasStrongMatch) {
    const context = relevant
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');
    const modelOut = await ai.generate({
      system: `${ANSWER_SYSTEM}\n\nContext:\n${context}`,
      prompt: query,
      temperature: 0.1,
    });

    const citations = relevant
      .map((r, i) => ({ index: i + 1, document: r.document, chunk_id: r.id, snippet: r.content.slice(0, 200) }))
      .filter((_, i) => new RegExp(`\\[${i + 1}\\]`).test(modelOut));

    const notInKb = /don't have information about that in the knowledge base/i.test(modelOut);

    return {
      content: modelOut.trim(),
      citations,
      grounded: !notInKb && citations.length > 0,
      confidence: Number(relevant[0].cosine.toFixed(3)),
      provider: ai.mode,
    };
  }

  const modelOut = await ai.generate({
    system: `You are a technical support assistant. The user asked a question that is not covered in the Minetech knowledge base.
- If the question is about general technical support, troubleshooting, software, hardware, networks, or IT issues, provide a helpful, concise answer using your general knowledge.
- If the question is completely unrelated to technical support (for example: cooking, sports, entertainment, personal advice), politely decline by saying exactly: "I don't have information about that in the knowledge base."
- Do not mention that the question is not in the knowledge base. Just answer helpfully for technical topics, or decline for non-technical topics.`,
    prompt: query,
    temperature: 0.2,
  });

  return {
    content: modelOut.trim(),
    citations: [],
    grounded: false,
    confidence: 0,
    provider: ai.mode,
  };
}

export async function knowledgeStats() {
  const [docs] = await pool.query('SELECT COUNT(*) AS n FROM documents');
  const [chunks] = await pool.query('SELECT COUNT(*) AS n FROM chunks');
  return { documents: docs[0].n, chunks: chunks[0].n };
}

/* ---- CLI: `node src/services/ragService.js ingest` -------------- */

if (process.argv[2] === 'ingest') {
  const { initSchema } = await import('../config/db.js');
  await initSchema();
  const res = await ingestAll();
  console.log('Ingested:');
  for (const r of res) console.log(`  - ${r.title}: ${r.chunks} chunks`);
  process.exit(0);
}
