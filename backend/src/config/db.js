import mysql from 'mysql2/promise';
import { config } from './config.js';

/**
 * MySQL connection pool (local XAMPP / remote compatible).
 *
 * The database is created on first initSchema() via a throwaway connection
 * that has NO default database (so it can issue CREATE DATABASE). The pool
 * itself is created WITH the database selected, so every pooled connection
 * connects straight into `minetech` once it exists.
 */
const base = {
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  waitForConnections: true,
  connectionLimit: config.mysql.connectionLimit,
  charset: 'utf8mb4',
};

const dbName = config.mysql.database;

export const pool = mysql.createPool({ ...base, database: dbName });

/**
 * Idempotent schema bootstrap: create the database (if missing) with a
 * no-db connection, then create tables on the main pool. Embeddings are stored
 * as a JSON array of floats in a JSON column; cosine similarity is computed in
 * Node, which is fine for small knowledge bases.
 */
export async function initSchema() {
  const tmp = await mysql.createConnection(base);
  try {
    await tmp.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`
    );
  } finally {
    await tmp.end();
  }

  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        raw_text      MEDIUMTEXT NOT NULL,
        category      VARCHAR(50),
        priority      VARCHAR(20),
        priority_reason TEXT,
        sentiment     VARCHAR(20),
        language      VARCHAR(10),
        key_entities  JSON,
        summary       VARCHAR(512),
        suggested_reply MEDIUMTEXT,
        confidence    FLOAT,
        status        VARCHAR(20) DEFAULT 'new',
        source        VARCHAR(50),
        meta          JSON,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_priority (priority),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        title      VARCHAR(255),
        source     VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT NOT NULL,
        chunk_index INT NOT NULL,
        content     MEDIUMTEXT NOT NULL,
        embedding   JSON,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_doc (document_id),
        FULLTEXT INDEX idx_content (content),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('[db] schema ready');
  } finally {
    conn.release();
  }
}
