import pg from 'pg';

const { Pool, types } = pg;

// Return DATE columns as plain "YYYY-MM-DD" strings, not local-midnight Date objects.
types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS entries (
      id           BIGSERIAL PRIMARY KEY,
      user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date         DATE NOT NULL,
      task         TEXT NOT NULL,
      complexity   TEXT NOT NULL DEFAULT 'None',
      what_i_did   TEXT NOT NULL DEFAULT '',
      issue        TEXT NOT NULL DEFAULT '',
      solution     TEXT NOT NULL DEFAULT '',
      impact       TEXT NOT NULL DEFAULT '',
      collaboration TEXT NOT NULL DEFAULT '',
      win          TEXT NOT NULL DEFAULT '',
      tomorrow     TEXT NOT NULL DEFAULT '',
      technologies TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_entries_user_date
      ON entries (user_id, date DESC, created_at DESC);
  `);
}

export const query = (text, params) => pool.query(text, params);

export default pool;
