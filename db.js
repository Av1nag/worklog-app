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
      id                          BIGSERIAL PRIMARY KEY,
      email                       TEXT NOT NULL UNIQUE,
      password_hash               TEXT NOT NULL,
      email_verified              BOOLEAN NOT NULL DEFAULT false,
      verification_token_hash     TEXT,
      verification_token_expires  TIMESTAMPTZ,
      reset_token_hash            TEXT,
      reset_token_expires         TIMESTAMPTZ,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS entries (
      id           BIGSERIAL PRIMARY KEY,
      user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date         DATE NOT NULL,
      task         TEXT NOT NULL,
      complexity   TEXT NOT NULL DEFAULT 'None',
      what_i_did   TEXT NOT NULL DEFAULT '',
      issue        TEXT NOT NULL DEFAULT '',
      solution     TEXT NOT NULL DEFAULT '',
      collaboration TEXT NOT NULL DEFAULT '',
      win          TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE entries DROP COLUMN IF EXISTS technologies;
    ALTER TABLE entries DROP COLUMN IF EXISTS impact;
    ALTER TABLE entries DROP COLUMN IF EXISTS tomorrow;

    CREATE INDEX IF NOT EXISTS idx_entries_user_date
      ON entries (user_id, date DESC, created_at DESC);

    CREATE TABLE IF NOT EXISTS todo_lists (
      user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      lines        JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    DROP TABLE IF EXISTS todos;
  `);
}

export const query = (text, params) => pool.query(text, params);

export default pool;
