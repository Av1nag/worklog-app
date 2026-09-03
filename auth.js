import { Router } from 'express';
import argon2 from 'argon2';
import { query } from './db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'not authenticated' });
  }
  req.userId = req.session.userId;
  next();
}

function publicUser(row) {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

const router = Router();

router.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'a valid email is required' });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
  }

  const passwordHash = await argon2.hash(password);

  let row;
  try {
    const result = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
      [email, passwordHash]
    );
    row = result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'an account with that email already exists' });
    }
    throw err;
  }

  req.session.userId = row.id;
  res.status(201).json(publicUser(row));
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const row = rows[0];

  const ok = row && (await argon2.verify(row.password_hash, password).catch(() => false));
  if (!ok) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'could not start session' });
    req.session.userId = row.id;
    res.json(publicUser(row));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.status(204).end();
  });
});

router.get('/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'not authenticated' });
  }
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
  if (!rows[0]) {
    return req.session.destroy(() => res.status(401).json({ error: 'not authenticated' }));
  }
  res.json(publicUser(rows[0]));
});

export default router;
