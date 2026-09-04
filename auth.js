import { Router } from 'express';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { query } from './db.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const RESET_TTL_MS = 1000 * 60 * 60;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function appUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

async function issueVerification(userId, email, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + VERIFICATION_TTL_MS);
  await query(
    'UPDATE users SET verification_token_hash = $1, verification_token_expires = $2 WHERE id = $3',
    [hashToken(token), expires, userId]
  );
  const verifyUrl = `${appUrl(req)}/api/auth/verify?token=${token}`;
  await sendVerificationEmail(email, verifyUrl);
}

async function issuePasswordReset(userId, email, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await query(
    'UPDATE users SET reset_token_hash = $1, reset_token_expires = $2 WHERE id = $3',
    [hashToken(token), expires, userId]
  );
  const resetUrl = `${appUrl(req)}/reset-password.html?token=${token}`;
  await sendPasswordResetEmail(email, resetUrl);
}

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'not authenticated' });
  }
  req.userId = req.session.userId;
  next();
}

function publicUser(row) {
  return { id: row.id, email: row.email, emailVerified: row.email_verified, createdAt: row.created_at };
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

  try {
    await issueVerification(row.id, row.email, req);
  } catch (err) {
    console.error('failed to send verification email:', err);
    return res.status(502).json({ error: 'account created, but the verification email could not be sent — try resending it' });
  }

  res.status(201).json({ email: row.email, message: 'check your email to verify your account before signing in' });
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

  if (!row.email_verified) {
    return res.status(403).json({ error: 'verify your email before signing in', unverified: true });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'could not start session' });
    req.session.userId = row.id;
    res.json(publicUser(row));
  });
});

router.get('/verify', async (req, res) => {
  const token = String(req.query?.token || '');
  if (!token) return res.redirect('/login.html?verify_error=1');

  const { rows } = await query(
    'SELECT * FROM users WHERE verification_token_hash = $1 AND verification_token_expires > now()',
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row) return res.redirect('/login.html?verify_error=1');

  await query(
    'UPDATE users SET email_verified = true, verification_token_hash = NULL, verification_token_expires = NULL WHERE id = $1',
    [row.id]
  );

  req.session.regenerate((err) => {
    if (err) return res.redirect('/login.html?verified=1');
    req.session.userId = row.id;
    res.redirect('/');
  });
});

router.post('/resend-verification', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'a valid email is required' });
  }

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const row = rows[0];

  if (row && !row.email_verified) {
    try {
      await issueVerification(row.id, row.email, req);
    } catch (err) {
      console.error('failed to resend verification email:', err);
      return res.status(502).json({ error: 'could not send the verification email — try again shortly' });
    }
  }

  res.json({ message: 'if that account needs verifying, an email is on its way' });
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'a valid email is required' });
  }

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const row = rows[0];

  if (row) {
    try {
      await issuePasswordReset(row.id, row.email, req);
    } catch (err) {
      console.error('failed to send password reset email:', err);
      return res.status(502).json({ error: 'could not send the reset email — try again shortly' });
    }
  }

  res.json({ message: 'if that account exists, a password reset email is on its way' });
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');

  if (!token) {
    return res.status(400).json({ error: 'reset token is required' });
  }
  if (password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
  }

  const { rows } = await query(
    'SELECT * FROM users WHERE reset_token_hash = $1 AND reset_token_expires > now()',
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row) {
    return res.status(400).json({ error: 'that reset link is invalid or has expired' });
  }

  const passwordHash = await argon2.hash(password);
  await query(
    `UPDATE users SET password_hash = $1, email_verified = true,
       reset_token_hash = NULL, reset_token_expires = NULL WHERE id = $2`,
    [passwordHash, row.id]
  );

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'could not start session' });
    req.session.userId = row.id;
    res.json(publicUser({ ...row, email_verified: true }));
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
