let allEntries = [];
let editingId = null;

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function formatTime(createdAt) {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDayHeading(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function techList(technologies) {
  if (!technologies.length) return '';
  const chips = technologies.map((t) => `<span class="tech-chip">${escapeHtml(t)}</span>`).join('');
  return `<div class="tech-list">${chips}</div>`;
}

function metaBlock(label, value) {
  return value ? `<p class="entry-meta"><strong>${label}</strong>${escapeHtml(value)}</p>` : '';
}

function collabBlock(collaboration) {
  const lines = collaboration.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  return `
    <div class="entry-collab">
      <p class="entry-collab-title">Collaboration</p>
      ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    </div>`;
}

function entryCard(entry) {
  const didItems = entry.whatIDid.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const badge =
    entry.complexity && entry.complexity !== 'None'
      ? `<span class="badge">${escapeHtml(entry.complexity)}</span>`
      : '';
  return `
    <article class="entry" data-id="${entry.id}" tabindex="0" title="Click to edit">
      <div class="entry-head">
        ${badge}
        <h3 class="entry-task">${escapeHtml(entry.task)}</h3>
        <span class="entry-time">${formatTime(entry.created_at)}</span>
        <button class="entry-delete" title="Delete entry" data-id="${entry.id}">Delete</button>
      </div>
      ${didItems ? `<ul class="entry-did">${didItems}</ul>` : ''}
      ${metaBlock('Issue', entry.issue)}
      ${metaBlock('Solution', entry.solution)}
      ${metaBlock('Impact', entry.impact)}
      ${collabBlock(entry.collaboration || '')}
      ${entry.win ? `<p class="entry-meta"><strong>Win</strong>${escapeHtml(entry.win)}</p>` : ''}
      ${entry.tomorrow ? `<p class="entry-meta"><strong>Next</strong>${escapeHtml(entry.tomorrow)}</p>` : ''}
      ${techList(entry.technologies)}
    </article>`;
}

function groupByDate(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  return groups;
}

function redirectToLogin() {
  window.location.href = '/login.html';
}

async function api(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    redirectToLogin();
    throw new Error('unauthenticated');
  }
  return res;
}

async function loadLog() {
  allEntries = await api('/api/entries').then((r) => r.json());
  const entries = allEntries;
  const container = document.getElementById('log-content');

  if (!entries.length) {
    container.innerHTML = '<p class="empty">Nothing logged yet. Select New entry to add the first one.</p>';
    return;
  }

  const groups = groupByDate(entries);
  container.innerHTML = [...groups.entries()]
    .map(
      ([date, rows]) => `
        <div class="day-group">
          <div class="day-heading">${formatDayHeading(date)} <span class="count">· ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}</span></div>
          <div class="entry-list">${rows.map(entryCard).join('')}</div>
        </div>`
    )
    .join('');
}

function readMultiline(id) {
  return document
    .getElementById(id)
    .value.split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

async function handleSubmit(e) {
  e.preventDefault();
  const body = {
    date: document.getElementById('f-date').value,
    task: document.getElementById('f-task').value,
    complexity: document.getElementById('f-complexity').value,
    whatIDid: readMultiline('f-did'),
    issue: document.getElementById('f-issue').value,
    solution: document.getElementById('f-solution').value,
    impact: document.getElementById('f-impact').value,
    collaboration: document.getElementById('f-collab').value,
    win: document.getElementById('f-win').value,
    tomorrow: document.getElementById('f-tomorrow').value,
    technologies: document.getElementById('f-tech').value,
  };

  const res = await api(editingId ? `/api/entries/${editingId}` : '/api/entries', {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return;

  closeEntryDialog();
  await loadLog();
}

async function handleDelete(id) {
  if (!window.confirm('Delete this entry?')) return;
  await api(`/api/entries/${id}`, { method: 'DELETE' });
  loadLog();
}

function openEntryDialog() {
  editingId = null;
  document.getElementById('entry-dialog-title').textContent = 'New entry';
  document.getElementById('entry-submit').textContent = 'Add entry';
  document.getElementById('entry-form').reset();
  document.getElementById('f-date').value = todayStr();
  document.getElementById('f-complexity').value = 'None';
  document.querySelector('.more').open = false;
  document.getElementById('entry-dialog').showModal();
  document.getElementById('f-task').focus();
}

function openEditDialog(id) {
  const entry = allEntries.find((e) => String(e.id) === String(id));
  if (!entry) return;

  editingId = id;
  document.getElementById('entry-dialog-title').textContent = 'Edit entry';
  document.getElementById('entry-submit').textContent = 'Save changes';
  document.getElementById('entry-form').reset();

  const set = (field, value) => {
    document.getElementById(field).value = value || '';
  };
  set('f-date', entry.date);
  set('f-task', entry.task);
  set('f-complexity', entry.complexity || 'None');
  set('f-did', entry.whatIDid.join('\n'));
  set('f-issue', entry.issue);
  set('f-solution', entry.solution);
  set('f-impact', entry.impact);
  set('f-collab', entry.collaboration);
  set('f-win', entry.win);
  set('f-tomorrow', entry.tomorrow);
  set('f-tech', entry.technologies.join(', '));

  document.querySelector('.more').open = Boolean(
    entry.collaboration || entry.win || entry.tomorrow
  );

  document.getElementById('entry-dialog').showModal();
  document.getElementById('f-task').focus();
}

function closeEntryDialog() {
  document.getElementById('entry-dialog').close();
}

function applyView(view) {
  document.getElementById('log-content').dataset.view = view;
  document.querySelectorAll('#view-toggle .segmented-option').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.view === view));
  });
  try {
    localStorage.setItem('worklog.view', view);
  } catch {}
}

function initView() {
  let view = 'list';
  try {
    view = localStorage.getItem('worklog.view') || 'list';
  } catch {}
  if (view !== 'list' && view !== 'cards') view = 'list';
  applyView(view);

  document.getElementById('view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-option');
    if (btn) applyView(btn.dataset.view);
  });
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  redirectToLogin();
}

async function init() {
  let me;
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return redirectToLogin();
    me = await res.json();
  } catch {
    return redirectToLogin();
  }

  document.getElementById('account-email').textContent = me.email;
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('f-date').value = todayStr();
  document.getElementById('entry-form').addEventListener('submit', handleSubmit);

  const dialog = document.getElementById('entry-dialog');
  document.getElementById('new-entry-btn').addEventListener('click', openEntryDialog);
  document.getElementById('entry-close').addEventListener('click', closeEntryDialog);
  document.getElementById('entry-cancel').addEventListener('click', closeEntryDialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeEntryDialog();
  });

  document.addEventListener('click', (e) => {
    if (e.target.matches('.entry-delete')) {
      handleDelete(e.target.dataset.id);
      return;
    }
    const entryEl = e.target.closest('.entry');
    if (entryEl && !window.getSelection().toString()) {
      openEditDialog(entryEl.dataset.id);
    }
  });

  document.getElementById('log-content').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.classList.contains('entry')) return;
    e.preventDefault();
    openEditDialog(e.target.dataset.id);
  });

  initView();
  loadLog();
}

init();
