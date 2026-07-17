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

  // LLM Mode: 'ollama', 'mock', or 'auto' (auto switches based on network/model availability)
  llm: {
    mode: process.env.LLM_MODE || 'ollama', // 'ollama' | 'mock' | 'auto'
    // Ollama settings (self-hosted)
    ollama: {
      endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'qwen2.5:0.5b',
      embedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    },
    // Mock mode for testing
    mock: {
      // No additional config needed
    },
    temperature: Number(process.env.LLM_TEMP) ?? 0.1, // Low for factual consistency
    maxTokens: Number(process.env.LLM_MAX_TOKENS) || 256,
  },

  rag: {
    chunkSize: Number(process.env.RAG_CHUNK_SIZE) || 600,
    chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP) || 100,
    topK: Number(process.env.RAG_TOP_K) || 5,
    similarityThreshold: Number(process.env.RAG_SIM_THRESHOLD) || 0.15, // Lower for better recall
    lexicalWeight: Number(process.env.RAG_LEXICAL_WEIGHT) || 0.3,
    knowledgeGlob: 'data/*.txt',
  },
};