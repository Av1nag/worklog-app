let mode = 'login';

const form = document.getElementById('auth-form');
const emailEl = document.getElementById('f-email');
const passwordEl = document.getElementById('f-password');
const errorEl = document.getElementById('auth-error');
const submitEl = document.getElementById('auth-submit');
const pwHint = document.getElementById('pw-hint');
const tabs = {
  login: document.getElementById('tab-login'),
  register: document.getElementById('tab-register'),
};

function setMode(next) {
  mode = next;
  tabs.login.setAttribute('aria-selected', String(next === 'login'));
  tabs.register.setAttribute('aria-selected', String(next === 'register'));
  submitEl.textContent = next === 'login' ? 'Sign in' : 'Create account';
  passwordEl.autocomplete = next === 'login' ? 'current-password' : 'new-password';
  pwHint.textContent = next === 'login' ? '' : '(min 8 characters)';
  errorEl.textContent = '';
}

tabs.login.addEventListener('click', () => setMode('login'));
tabs.register.addEventListener('click', () => setMode('register'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  submitEl.disabled = true;

  try {
    const res = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailEl.value.trim(), password: passwordEl.value }),
    });

    if (res.ok) {
      window.location.href = '/';
      return;
    }

    const data = await res.json().catch(() => ({}));
    errorEl.textContent = data.error || 'Something went wrong. Try again.';
  } catch {
    errorEl.textContent = 'Network error. Try again.';
  } finally {
    submitEl.disabled = false;
  }
});

// If already signed in, skip the form.
fetch('/api/auth/me').then((r) => {
  if (r.ok) window.location.href = '/';
});

setMode('login');
