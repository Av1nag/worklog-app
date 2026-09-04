const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function send(to, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  if (!apiKey || !fromEmail) {
    throw new Error('BREVO_API_KEY and EMAIL_FROM must be set to send email');
  }

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: 'Worklog' },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed: ${res.status} ${body}`);
  }
}

export function sendVerificationEmail(to, verifyUrl) {
  return send(
    to,
    'Verify your Worklog email',
    `
      <p>Confirm your email address to finish setting up your Worklog account.</p>
      <p><a href="${verifyUrl}">Verify email</a></p>
      <p>Or paste this link into your browser:<br>${verifyUrl}</p>
      <p>This link expires in 24 hours. If you didn't create a Worklog account, you can ignore this email.</p>
    `
  );
}

export function sendPasswordResetEmail(to, resetUrl) {
  return send(
    to,
    'Reset your Worklog password',
    `
      <p>We received a request to reset the password for your Worklog account.</p>
      <p><a href="${resetUrl}">Choose a new password</a></p>
      <p>Or paste this link into your browser:<br>${resetUrl}</p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.</p>
    `
  );
}
