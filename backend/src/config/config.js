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
      model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
    },
    // Mock mode for testing
    mock: {
      // No additional config needed
    },
    temperature: Number(process.env.LLM_TEMP) ?? 0.2,
    maxTokens: Number(process.env.LLM_MAX_TOKENS) || 256, // Reduced for speed
  },

  rag: {
    chunkSize: Number(process.env.RAG_CHUNK_SIZE) || 600,
    chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP) || 100,
    topK: Number(process.env.RAG_TOP_K) || 5, // Increased for better recall
    similarityThreshold: Number(process.env.RAG_SIM_THRESHOLD) || 0.35, // Higher threshold for quality
    lexicalWeight: Number(process.env.RAG_LEXICAL_WEIGHT) || 0.3,
    knowledgeGlob: 'data/*.txt',
  },
};