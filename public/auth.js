let mode = 'login';
let lastAttemptedEmail = '';

const form = document.getElementById('auth-form');
const emailEl = document.getElementById('f-email');
const passwordEl = document.getElementById('f-password');
const passwordField = document.getElementById('password-field');
const errorEl = document.getElementById('auth-error');
const infoEl = document.getElementById('auth-info');
const resendBtn = document.getElementById('resend-btn');
const forgotLink = document.getElementById('forgot-link');
const backLink = document.getElementById('back-link');
const submitEl = document.getElementById('auth-submit');
const pwHint = document.getElementById('pw-hint');
const modeTabs = document.getElementById('mode-tabs');
const forgotHeader = document.getElementById('forgot-header');
const tabs = {
  login: document.getElementById('tab-login'),
  register: document.getElementById('tab-register'),
};

function setMode(next) {
  mode = next;
  const isForgot = next === 'forgot';

  modeTabs.hidden = isForgot;
  forgotHeader.hidden = !isForgot;
  forgotLink.hidden = next !== 'login';
  passwordField.hidden = isForgot;
  passwordEl.required = !isForgot;

  tabs.login.setAttribute('aria-selected', String(next === 'login'));
  tabs.register.setAttribute('aria-selected', String(next === 'register'));
  submitEl.textContent = isForgot ? 'Send reset link' : next === 'login' ? 'Sign in' : 'Create account';
  passwordEl.autocomplete = next === 'login' ? 'current-password' : 'new-password';
  pwHint.textContent = next === 'register' ? '(min 8 characters)' : '';
  clearMessages();

  const url = new URL(window.location);
  if (next === 'register') url.searchParams.set('mode', 'register');
  else url.searchParams.delete('mode');
  window.history.replaceState({}, '', url);
}

function clearMessages() {
  errorEl.hidden = true;
  errorEl.textContent = '';
  infoEl.hidden = true;
  infoEl.textContent = '';
  resendBtn.hidden = true;
}

function showInfo(message) {
  infoEl.textContent = message;
  infoEl.hidden = false;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

tabs.login.addEventListener('click', () => setMode('login'));
tabs.register.addEventListener('click', () => setMode('register'));
forgotLink.addEventListener('click', () => setMode('forgot'));
backLink.addEventListener('click', () => setMode('login'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();
  submitEl.disabled = true;
  lastAttemptedEmail = emailEl.value.trim();

  try {
    if (mode === 'forgot') {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lastAttemptedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showInfo(data.message || 'If that account exists, a password reset email is on its way.');
      } else {
        showError(data.error || 'Something went wrong. Try again.');
      }
      return;
    }

    const res = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: lastAttemptedEmail, password: passwordEl.value }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (mode === 'register') {
        form.reset();
        setMode('login');
        showInfo(data.message || 'Check your email to verify your account.');
      } else {
        window.location.href = '/';
      }
      return;
    }

    showError(data.error || 'Something went wrong. Try again.');
    if (data.unverified) resendBtn.hidden = false;
  } catch {
    showError('Network error. Try again.');
  } finally {
    submitEl.disabled = false;
  }
});

resendBtn.addEventListener('click', async () => {
  const email = lastAttemptedEmail || emailEl.value.trim();
  if (!email) return;
  resendBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    resendBtn.hidden = true;
    showInfo(data.message || 'If that account needs verifying, an email is on its way.');
  } catch {
    showError('Network error. Try again.');
  } finally {
    resendBtn.disabled = false;
  }
});

const params = new URLSearchParams(window.location.search);
setMode(params.get('mode') === 'register' ? 'register' : 'login');

if (params.has('verify_error')) {
  showError('That verification link is invalid or has expired.');
  resendBtn.hidden = false;
}
if (params.has('verified')) {
  showInfo('Email verified — sign in below.');
}
if (params.has('verify_error') || params.has('verified')) {
  window.history.replaceState({}, '', window.location.pathname);
}

// If already signed in, skip the form.
fetch('/api/auth/me').then((r) => {
  if (r.ok) window.location.href = '/';
});
