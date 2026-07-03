import nodemailer from 'nodemailer';

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.SMTP_HOST) {
    // Production/staging: use configured SMTP credentials
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development / test: use Ethereal throwaway account (logs preview URL to console)
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return _transporter;
}

/**
 * Send a verification email.
 * @param {string} to   - Recipient email address
 * @param {string} link - Full verification link
 */
export async function sendVerificationEmail(to, link) {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"DecisionVault" <noreply@decisionvault.dev>',
    to,
    subject: 'Verify your DecisionVault account',
    text: `Hello! Please verify your email by visiting: ${link}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#6c5ce7;">DecisionVault — Email Verification</h2>
        <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6c5ce7;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
          Verify Email
        </a>
        <p style="margin-top:16px;color:#888;font-size:0.8rem;">
          Or copy this link: <a href="${link}">${link}</a>
        </p>
      </div>
    `,
  });

  // In dev/test, log the Ethereal preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[Mailer] Verification email preview: ${previewUrl}`);
  }

  return info;
}
