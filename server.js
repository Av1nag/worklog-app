import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query, initSchema } from './db.js';
import authRouter, { requireAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const COMPLEXITY_LEVELS = ['None', 'Low', 'Medium', 'High'];

const PgStore = connectPgSimple(session);

app.set('trust proxy', 1);
app.use(express.json());
app.use(
  session({
    name: 'sid',
    store: new PgStore({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

app.use('/api/auth', authRouter);
app.use(express.static(path.join(__dirname, 'public')));

const splitList = (val, sep) =>
  (Array.isArray(val) ? val : String(val || '').split(sep))
    .map((v) => v.trim())
    .filter(Boolean);

const joinList = (items, sep) => splitList(items, '\n').join(sep);

function toRow(row) {
  return {
    ...row,
    whatIDid: row.what_i_did ? row.what_i_did.split('\n') : [],
  };
}

app.get('/api/entries', requireAuth, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM entries WHERE user_id = $1 ORDER BY date DESC, created_at DESC',
    [req.userId]
  );
  res.json(rows.map(toRow));
});

app.post('/api/entries', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.date || !b.task || !b.task.trim()) {
    return res.status(400).json({ error: 'date and task are required' });
  }
  const complexity = COMPLEXITY_LEVELS.includes(b.complexity) ? b.complexity : 'None';

  const { rows } = await query(
    `INSERT INTO entries
      (user_id, date, task, complexity, what_i_did, issue, solution,
       collaboration, win)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      req.userId,
      b.date,
      b.task.trim(),
      complexity,
      joinList(b.whatIDid, '\n'),
      (b.issue || '').trim(),
      (b.solution || '').trim(),
      joinList(b.collaboration, '\n'),
      (b.win || '').trim(),
    ]
  );

  res.status(201).json(toRow(rows[0]));
});

app.put('/api/entries/:id', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.date || !b.task || !b.task.trim()) {
    return res.status(400).json({ error: 'date and task are required' });
  }
  const complexity = COMPLEXITY_LEVELS.includes(b.complexity) ? b.complexity : 'None';

  const { rows } = await query(
    `UPDATE entries SET
       date = $1, task = $2, complexity = $3, what_i_did = $4, issue = $5,
       solution = $6, collaboration = $7, win = $8
     WHERE id = $9 AND user_id = $10
     RETURNING *`,
    [
      b.date,
      b.task.trim(),
      complexity,
      joinList(b.whatIDid, '\n'),
      (b.issue || '').trim(),
      (b.solution || '').trim(),
      joinList(b.collaboration, '\n'),
      (b.win || '').trim(),
      req.params.id,
      req.userId,
    ]
  );

  if (!rows.length) return res.status(404).json({ error: 'entry not found' });
  res.json(toRow(rows[0]));
});

app.delete('/api/entries/:id', requireAuth, async (req, res) => {
  await query('DELETE FROM entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.status(204).end();
});

// ---------- todos (a single per-user checklist notepad) ----------

const cleanLines = (val) =>
  (Array.isArray(val) ? val : [])
    .slice(0, 2000)
    .map((l) => ({
      text: String(l && l.text != null ? l.text : '').slice(0, 4000),
      checked: Boolean(l && l.checked),
    }));

app.get('/api/todos', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT lines FROM todo_lists WHERE user_id = $1', [req.userId]);
  res.json({ lines: rows.length ? rows[0].lines : [] });
});

app.put('/api/todos', requireAuth, async (req, res) => {
  const lines = cleanLines((req.body || {}).lines);
  await query(
    `INSERT INTO todo_lists (user_id, lines, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET lines = EXCLUDED.lines, updated_at = now()`,
    [req.userId, JSON.stringify(lines)]
  );
  res.json({ lines });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Worklog running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
