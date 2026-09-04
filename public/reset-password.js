const form = document.getElementById('reset-form');
const passwordEl = document.getElementById('f-password');
const confirmEl = document.getElementById('f-password-confirm');
const errorEl = document.getElementById('auth-error');
const submitEl = document.getElementById('reset-submit');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

const token = new URLSearchParams(window.location.search).get('token');
if (!token) {
  showError('This reset link is missing its token — request a new one from the sign-in page.');
  form.querySelectorAll('input, button').forEach((el) => (el.disabled = true));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  if (passwordEl.value !== confirmEl.value) {
    showError('Passwords do not match.');
    return;
  }

  submitEl.disabled = true;
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: passwordEl.value }),
    });

    if (res.ok) {
      window.location.href = '/';
      return;
    }

    const data = await res.json().catch(() => ({}));
    showError(data.error || 'Something went wrong. Try again.');
  } catch {
    showError('Network error. Try again.');
  } finally {
    submitEl.disabled = false;
  }
});
