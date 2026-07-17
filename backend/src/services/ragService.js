import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, Type } from '@lancedb/lancedb';
import { config } from '../config/config.js';
import { getAI } from './aiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const LANCE_DIR = path.resolve(__dirname, '../../data/lancedb');

/* ---- LanceDB Connection ------------------------------------------ */

let _db = null;
let _table = null;

async function getDb() {
  if (_db) return _db;

  // Ensure directory exists
  if (!fs.existsSync(LANCE_DIR)) {
    fs.mkdirSync(LANCE_DIR, { recursive: true });
  }

  _db = await connect(LANCE_DIR);
  return _db;
}

async function getTable() {
  if (_table) return _table;

  const db = await getDb();

  // Check if table exists
  const tableNames = await db.tableNames();
  if (tableNames.includes('chunks')) {
    _table = await db.openTable('chunks');
    return _table;
  }

  // Create new table with schema
  _table = await db.createTable('chunks', [
    { name: 'id', type: Type.int32(), vector: false },
    { name: 'document_id', type: Type.int32(), vector: false },
    { name: 'document_title', type: Type.string(), vector: false },
    { name: 'chunk_index', type: Type.int32(), vector: false },
    { name: 'content', type: Type.string(), vector: false },
    { name: 'embedding', type: Type.float32(), vector: true, dimension: 768 }
  ]);

  return _table;
}

/* ---- System Instructions ------------------------------------------ */

let SYSTEM_INSTRUCTIONS = `You are a support assistant for MineTech, a mining technology company.
You answer ONLY questions about MineTech operations, safety protocols, technical support, billing, account access, and company policies.
If the user asks about sports, politics, entertainment, cooking, or any topic unrelated to MineTech, politely refuse and redirect to MineTech-related topics.
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

/* ---- Hallucination Prevention Instructions ------------------------ */

const HALLUCINATION_GUARD = `
CRITICAL RULES - STRICTLY FOLLOW:
1. ONLY answer based on the provided context below
2. If the context does NOT contain the answer, you MUST say: "I don't have enough information in my knowledge base to answer that accurately. Please contact support@minetech.com for assistance."
3. NEVER use your internal knowledge - only use information from the provided context
4. ALWAYS cite sources using [1], [2], etc. for every factual claim
5. If you cannot find relevant information, don't guess - explicitly state you don't know
6. Keep answers concise and directly related to the question`;

/* ---- Chunking ---------------------------------------------------- */

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

/* ---- Ingestion ---------------------------------------------------- */

let _nextId = 1;
let _nextDocId = 1;

async function getNextId() {
  return _nextId++;
}

async function getNextDocId() {
  return _nextDocId++;
}

export async function ingestFile(filePath) {
  const ai = await getAI();
  const title = path.basename(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const chunks = chunkText(text);
  if (chunks.length === 0) return { title, chunks: 0 };

  const documentId = await getNextDocId();
  const records = [];

  // Generate embeddings in parallel
  const embedPromises = chunks.map(async (chunk, i) => {
    const embedding = await ai.embed(chunk);
    return { index: i, chunk, embedding };
  });

  const results = await Promise.all(embedPromises);

  for (const { index, chunk, embedding } of results) {
    records.push({
      id: await getNextId(),
      document_id: documentId,
      document_title: title,
      chunk_index: index,
      content: chunk,
      embedding: embedding || new Array(768).fill(0)
    });
  }

  // Insert into LanceDB
  const table = await getTable();
  await table.add(records);

  return { title, chunks: chunks.length };
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

/* ---- Retrieval ---------------------------------------------------- */

export async function retrieve(query, topK = config.rag.topK) {
  const ai = await getAI();
  const queryEmbedding = await ai.embed(query);

  if (!queryEmbedding) {
    console.warn('[rag] Failed to generate query embedding');
    return { results: [], relevant: [], queryEmbedding: null };
  }

  const table = await getTable();

  // Use LanceDB vector search
  const results = await table
    .vectorSearch(queryEmbedding)
    .limit(topK * 2) // Get more to filter by threshold
    .execute();

  // Calculate cosine similarity for each result
  const scored = results.map((r) => {
    const emb = r.embedding || [];
    const cosine = computeCosine(queryEmbedding, emb);
    return {
      id: r.id,
      document_id: r.document_id,
      document: r.document_title,
      chunk_index: r.chunk_index,
      content: r.content,
      cosine: cosine
    };
  });

  // Sort by cosine similarity
  scored.sort((a, b) => b.cosine - a.cosine);

  // Filter by threshold
  const relevant = scored.filter((s) => s.cosine >= config.rag.similarityThreshold);

  return {
    results: scored.slice(0, topK).map((s, i) => ({ ...s, rank: i + 1 })),
    relevant: relevant.slice(0, topK),
    queryEmbedding: queryEmbedding
  };
}

function computeCosine(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);

  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/* ---- Answer Generation -------------------------------------------- */

export async function answer(query) {
  const ai = await getAI();

  const { relevant } = await retrieve(query);

  let modelOut;
  let citations = [];
  let grounded = false;
  let confidence = 0;

  if (relevant.length > 0) {
    // Build context with citations
    const context = relevant
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');

    const systemPrompt = `${SYSTEM_INSTRUCTIONS}\n\n${HALLUCINATION_GUARD}\n\nRelevant information from knowledge base:\n${context}`;

    console.log('=== RAG RETRIEVAL ===');
    console.log('Query:', query);
    console.log('Relevant chunks found:', relevant.length);
    relevant.forEach((r, i) => {
      console.log(`[${i + 1}] (score: ${r.cosine.toFixed(3)}) ${r.document}: ${r.content.slice(0, 100)}...`);
    });

    modelOut = await ai.generate({
      system: systemPrompt,
      prompt: query,
      temperature: 0.1, // Low temperature for factual consistency
      maxTokens: 256
    });

    console.log('=== RAG MODEL OUTPUT ===');
    console.log(modelOut);

    // Validate and extract citations
    const usedCitations = [];
    relevant.forEach((r, i) => {
      // Check if model referenced this source
      const citationRegex = new RegExp(`\\[${i + 1}\\]`, 'i');
      if (citationRegex.test(modelOut)) {
        usedCitations.push({
          index: i + 1,
          document: r.document,
          chunk_id: r.id,
          snippet: r.content.slice(0, 200)
        });
      }
    });

    citations = usedCitations;
    grounded = citations.length > 0;
    confidence = relevant[0] ? Number(relevant[0].cosine.toFixed(3)) : 0;

    // Additional check: if no citations found but we have context,
    // try to find citations by looking for document references
    if (!grounded && relevant.length > 0) {
      // Check if model mentions any content from the context
      const modelLower = modelOut.toLowerCase();
      for (const r of relevant) {
        const contentLower = r.content.toLowerCase();
        // If model echoes significant content, consider it grounded
        const sharedWords = modelLower.split(/\s+/).filter(w => w.length > 4)
          .filter(w => contentLower.includes(w));
        if (sharedWords.length > 5) {
          grounded = true;
          break;
        }
      }
    }
  } else {
    // No relevant context - must say so
    const systemPrompt = `${SYSTEM_INSTRUCTIONS}\n\n${HALLUCINATION_GUARD}`;

    console.log('=== RAG RETRIEVAL ===');
    console.log('Query:', query);
    console.log('No relevant chunks found');

    modelOut = await ai.generate({
      system: systemPrompt,
      prompt: query,
      temperature: 0.1,
      maxTokens: 256
    });

    console.log('=== RAG MODEL OUTPUT ===');
    console.log(modelOut);

    // Check if model followed the "don't know" rule
    const dontKnowPhrase = "don't have enough information";
    const dontKnowPhrase2 = "don't have sufficient information";
    const dontKnowPhrase3 = "not in my knowledge base";

    if (modelOut.toLowerCase().includes(dontKnowPhrase) ||
        modelOut.toLowerCase().includes(dontKnowPhrase2) ||
        modelOut.toLowerCase().includes(dontKnowPhrase3)) {
      grounded = true; // Model correctly said it doesn't know
    }

    confidence = 0;
  }

  return {
    content: modelOut.trim(),
    citations,
    grounded,
    confidence,
    provider: 'ollama'
  };
}

/* ---- Stats -------------------------------------------------------- */

export async function knowledgeStats() {
  try {
    const table = await getTable();
    const count = await table.count();
    return { chunks: count, documents: 'N/A (see files in data/)' };
  } catch {
    return { chunks: 0, documents: 0 };
  }
}

/* ---- CLI -------------------------------------------------------- */

if (process.argv[2] === 'ingest') {
  const res = await ingestAll();
  console.log('Ingested:');
  for (const r of res) console.log(`  - ${r.title}: ${r.chunks} chunks`);
  process.exit(0);
}