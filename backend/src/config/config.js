import 'dotenv/config';

/**
 * Application configuration. Everything overridable via .env (see .env.example).
 * Defaults keep the app bootable with the offline mock provider and sensible
 * cPanel-style MySQL placeholders.
 */
export const config = {
  port: Number(process.env.PORT) || 4000,

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'minetech',
    connectionLimit: Number(process.env.MYSQL_POOL) || 10,
  },

  llm: {
    // 'mock' -> deterministic offline provider (no download, runs anywhere)
    // 'hf'   -> self-hosted Hugging Face model via Transformers.js
    mode: process.env.LLM_MODE || 'mock',
    hfModelId: process.env.HF_MODEL_ID || 'onnx-community/Qwen2.5-0.5B-Instruct',
    hfEmbedModelId: process.env.HF_EMBED_MODEL_ID || 'Xenova/all-MiniLM-L6-v2',
    dtype: process.env.HF_DTYPE || 'q4',
    device: process.env.TRANSFORMERS_DEVICE || 'cpu',
    temperature: Number(process.env.LLM_TEMP) ?? 0.2,
    maxTokens: Number(process.env.LLM_MAX_TOKENS) || 512,
  },

  rag: {
    chunkSize: Number(process.env.RAG_CHUNK_SIZE) || 600,
    chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP) || 100,
    topK: Number(process.env.RAG_TOP_K) || 4,
    similarityThreshold: Number(process.env.RAG_SIM_THRESHOLD) || 0.25,
    lexicalWeight: Number(process.env.RAG_LEXICAL_WEIGHT) || 0.3,
    // Glob of knowledge-base files ingested on `npm run ingest`.
    knowledgeGlob: 'data/*.txt',
  },
};
