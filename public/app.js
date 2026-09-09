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
      ${collabBlock(entry.collaboration || '')}
      ${entry.win ? `<p class="entry-meta"><strong>Win</strong>${escapeHtml(entry.win)}</p>` : ''}
    </article>`;
}

/* ---------- todos notepad ---------- */
let notepadSaveTimer = null;

function notepadEl() {
  return document.getElementById('notepad');
}

function noteLineEl(text = '', checked = false) {
  const line = document.createElement('div');
  line.className = 'note-line' + (checked ? ' checked' : '');

  const drag = document.createElement('button');
  drag.type = 'button';
  drag.className = 'note-drag';
  drag.tabIndex = -1;
  drag.setAttribute('aria-label', 'Drag to reorder');
  drag.innerHTML =
    '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">' +
    '<circle cx="3" cy="3" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="3" cy="13" r="1.2"/>' +
    '<circle cx="7" cy="3" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="7" cy="13" r="1.2"/></svg>';

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'note-check';
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(checked));
  check.setAttribute('aria-label', 'Toggle done');
  check.tabIndex = -1;

  const input = document.createElement('textarea');
  input.className = 'note-text';
  input.rows = 1;
  input.autocomplete = 'off';
  input.value = text;

  line.append(drag, check, input);
  return line;
}

// Keep completed lines at the bottom, preserving relative order in each group.
function reflowNotepad() {
  const pad = notepadEl();
  [...pad.children]
    .filter((l) => l.classList.contains('checked'))
    .forEach((l) => pad.appendChild(l));
}

function autoGrowNote(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function renderNotepad(lines) {
  const pad = notepadEl();
  pad.innerHTML = '';
  const use = lines && lines.length ? lines : [{ text: '', checked: false }];
  for (const l of use) pad.appendChild(noteLineEl(l.text || '', Boolean(l.checked)));
  reflowNotepad();
  pad.querySelector('.note-text').placeholder = 'Write a todo…';
  pad.querySelectorAll('.note-text').forEach(autoGrowNote);
}

function serializeNotepad() {
  return [...notepadEl().querySelectorAll('.note-line')].map((line) => ({
    text: line.querySelector('.note-text').value,
    checked: line.classList.contains('checked'),
  }));
}

function focusLine(line, caret) {
  const input = line.querySelector('.note-text');
  input.focus();
  const pos = caret === 'end' ? input.value.length : caret || 0;
  input.setSelectionRange(pos, pos);
}

async function saveNotepad() {
  clearTimeout(notepadSaveTimer);
  notepadSaveTimer = null;
  await api('/api/todos', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: serializeNotepad() }),
  });
}

function scheduleNotepadSave() {
  clearTimeout(notepadSaveTimer);
  notepadSaveTimer = setTimeout(saveNotepad, 700);
}

async function loadTodos() {
  const data = await api('/api/todos').then((r) => r.json());
  renderNotepad(data.lines || []);
}

function onNotepadKeydown(e) {
  const input = e.target;
  if (!input.classList || !input.classList.contains('note-text')) return;
  const line = input.closest('.note-line');

  if (e.key === 'Enter' && e.shiftKey) {
    // let the textarea insert a newline; just keep height and save in sync
    requestAnimationFrame(() => autoGrowNote(input));
    scheduleNotepadSave();
    return;
  }

  // Alt + Arrow reorders the current line
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const sib =
      e.key === 'ArrowUp' ? line.previousElementSibling : line.nextElementSibling;
    if (!sib) return;
    e.preventDefault();
    if (e.key === 'ArrowUp') line.parentNode.insertBefore(line, sib);
    else line.parentNode.insertBefore(sib, line);
    const caret = input.selectionStart;
    input.focus();
    input.setSelectionRange(caret, caret);
    scheduleNotepadSave();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const after = input.value.slice(input.selectionEnd);
    input.value = input.value.slice(0, input.selectionStart);
    autoGrowNote(input);
    const newLine = noteLineEl(after, false);
    line.after(newLine);
    focusLine(newLine, 0);
    autoGrowNote(newLine.querySelector('.note-text'));
    scheduleNotepadSave();
    return;
  }

  if (e.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0) {
    const prev = line.previousElementSibling;
    if (!prev) return;
    e.preventDefault();
    const prevInput = prev.querySelector('.note-text');
    const caret = prevInput.value.length;
    prevInput.value += input.value;
    line.remove();
    focusLine(prev, caret);
    autoGrowNote(prevInput);
    scheduleNotepadSave();
    return;
  }

  const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
  const atEnd =
    input.selectionStart === input.value.length &&
    input.selectionEnd === input.value.length;

  if (e.key === 'ArrowUp' && atStart && line.previousElementSibling) {
    e.preventDefault();
    focusLine(line.previousElementSibling, 'end');
  } else if (e.key === 'ArrowDown' && atEnd && line.nextElementSibling) {
    e.preventDefault();
    focusLine(line.nextElementSibling, 'end');
  }
}

function onNotepadClick(e) {
  const check = e.target.closest('.note-check');
  if (!check) return;
  const line = check.closest('.note-line');
  const checked = !line.classList.contains('checked');
  line.classList.toggle('checked', checked);
  check.setAttribute('aria-checked', String(checked));
  reflowNotepad();
  scheduleNotepadSave();
}

function lineBeforePoint(pad, y) {
  const lines = [...pad.querySelectorAll('.note-line:not(.note-dragging)')];
  return lines.find((line) => {
    const box = line.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
}

const NOTE_SLIDE = 190;
const NOTE_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const NOTE_TRANSITION =
  `transform ${NOTE_SLIDE}ms ${NOTE_EASE}, box-shadow 0.16s ease, background-color 0.16s ease`;

function initTodoDrag(pad) {
  let drag = null;
  let startY = 0; // pointer Y at grab
  let pointerY = 0; // latest pointer Y
  let slack = 0; // layout shift compensation so the held line tracks the pointer

  const follow = () => {
    drag.style.transform = `translateY(${pointerY - startY + slack}px) scale(1.015)`;
  };

  // Reorder the DOM, then animate every displaced sibling from its old slot (FLIP).
  const reorder = (mutate) => {
    const others = [...pad.querySelectorAll('.note-line')].filter((l) => l !== drag);
    const prevTop = new Map(others.map((l) => [l, l.getBoundingClientRect().top]));
    const dragBefore = drag.getBoundingClientRect().top;

    mutate();

    slack += dragBefore - drag.getBoundingClientRect().top;
    follow();

    for (const l of others) {
      const delta = prevTop.get(l) - l.getBoundingClientRect().top;
      if (!delta) continue;
      l.style.transition = 'none';
      l.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        l.style.transition = NOTE_TRANSITION;
        l.style.transform = '';
      });
    }
  };

  pad.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.note-drag');
    if (!handle) return;
    e.preventDefault();
    drag = handle.closest('.note-line');
    startY = pointerY = e.clientY;
    slack = 0;
    drag.classList.add('note-dragging');
    document.body.classList.add('note-reordering');
    handle.setPointerCapture(e.pointerId);
    drag.style.transition = 'transform 130ms ease';
    follow();
  });

  pad.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.style.transition = 'none';
    pointerY = e.clientY;
    follow();

    const before = lineBeforePoint(pad, e.clientY);
    if (!before) {
      if (pad.lastElementChild !== drag) reorder(() => pad.appendChild(drag));
    } else if (before !== drag && before.previousElementSibling !== drag) {
      reorder(() => pad.insertBefore(drag, before));
    }
  });

  const end = () => {
    if (!drag) return;
    const line = drag;
    drag = null;
    document.body.classList.remove('note-reordering');

    line.style.transition = NOTE_TRANSITION;
    line.style.transform = '';
    const settle = (e) => {
      if (e && e.propertyName !== 'transform') return;
      line.classList.remove('note-dragging');
      line.style.transition = '';
      line.style.transform = '';
      line.removeEventListener('transitionend', settle);
      clearTimeout(timer);
    };
    const timer = setTimeout(settle, NOTE_SLIDE + 60);
    line.addEventListener('transitionend', settle);
    scheduleNotepadSave();
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}

function initTodos() {
  const pad = notepadEl();
  pad.addEventListener('keydown', onNotepadKeydown);
  pad.addEventListener('click', onNotepadClick);
  pad.addEventListener('input', (e) => {
    if (!e.target.classList.contains('note-text')) return;
    autoGrowNote(e.target);
    scheduleNotepadSave();
  });
  pad.addEventListener('focusout', (e) => {
    if (!pad.contains(e.relatedTarget) && notepadSaveTimer) saveNotepad();
  });
  initTodoDrag(pad);
}

function applySection(section) {
  if (section !== 'log' && section !== 'todos') section = 'log';
  document.getElementById('view-log').hidden = section !== 'log';
  document.getElementById('view-todos').hidden = section !== 'todos';
  document.getElementById('new-entry-btn').hidden = section !== 'log';
  document.querySelectorAll('#section-nav .segmented-option').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.section === section));
  });
  try {
    localStorage.setItem('worklog.section', section);
  } catch {}
  if (section === 'todos') loadTodos();
  else loadLog();
}

function initSection() {
  let section = 'log';
  try {
    section = localStorage.getItem('worklog.section') || 'log';
  } catch {}
  applySection(section);
  document.getElementById('section-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-option');
    if (btn) applySection(btn.dataset.section);
  });
  initTodos();
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
    collaboration: document.getElementById('f-collab').value,
    win: document.getElementById('f-win').value,
  };

  const res = await api(editingId ? `/api/entries/${editingId}` : '/api/entries', {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return;

  clearDraft();
  document.getElementById('entry-form').reset();
  closeEntryDialog();
  await loadLog();
}

async function handleDelete(id) {
  if (!window.confirm('Delete this entry?')) return;
  await api(`/api/entries/${id}`, { method: 'DELETE' });
  loadLog();
}

const DRAFT_KEY = 'worklog.draft';
const DRAFT_FIELDS = ['f-date', 'f-task', 'f-complexity', 'f-did', 'f-issue', 'f-solution', 'f-collab', 'f-win'];

function draftHasContent(data) {
  return ['f-task', 'f-did', 'f-issue', 'f-solution', 'f-collab', 'f-win'].some(
    (id) => (data[id] || '').trim() !== ''
  );
}

function saveDraft() {
  if (editingId !== null) return;
  const data = {};
  DRAFT_FIELDS.forEach((id) => {
    data[id] = document.getElementById(id).value;
  });
  try {
    if (draftHasContent(data)) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch {}
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

function restoreDraft() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch {}
  if (!data) return;
  DRAFT_FIELDS.forEach((id) => {
    if (data[id] != null) document.getElementById(id).value = data[id];
  });
}

function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function autoGrowAll() {
  document
    .querySelectorAll('#entry-form textarea')
    .forEach((el) => autoGrowTextarea(el));
}

function openEntryDialog() {
  editingId = null;
  document.getElementById('entry-dialog-title').textContent = 'New entry';
  document.getElementById('entry-submit').textContent = 'Add entry';
  document.getElementById('entry-form').reset();
  document.getElementById('f-date').value = todayStr();
  document.getElementById('f-complexity').value = 'None';
  restoreDraft();
  document.getElementById('entry-dialog').showModal();
  autoGrowAll();
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
  set('f-collab', entry.collaboration);
  set('f-win', entry.win);

  document.getElementById('entry-dialog').showModal();
  autoGrowAll();
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
  dialog.addEventListener('close', saveDraft);
  document.querySelectorAll('#entry-form textarea').forEach((el) => {
    el.addEventListener('input', () => autoGrowTextarea(el));
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
  initSection();
}

init();
