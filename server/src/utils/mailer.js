import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.SMTP_HOST) {
    let host = process.env.SMTP_HOST;
    try {
      const ips = await dns.promises.resolve4(host);
      if (ips && ips.length > 0) {
        console.log(`[Mailer] Resolved ${host} to IPv4: ${ips[0]}`);
        host = ips[0];
      }
    } catch (dnsErr) {
      console.warn(`[Mailer] DNS IPv4 resolution failed for ${process.env.SMTP_HOST}:`, dnsErr.message);
    }

    // Production/staging: use configured SMTP credentials
    _transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        servername: process.env.SMTP_HOST,
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
 * @param {string} to  - Recipient email address
 * @param {string} otp - 6-digit OTP code
 */
export async function sendVerificationEmail(to, otp) {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '"DecisionVault" <noreply@decisionvault.dev>',
    to,
    subject: 'Your DecisionVault Verification OTP Code',
    text: `Hello! Your verification OTP code is: ${otp}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;border:1px solid #ddd;padding:20px;border-radius:8px;">
        <h2 style="color:#6c5ce7;margin-top:0;">DecisionVault — Email Verification</h2>
        <p>Please use the following 6-digit OTP code to verify your email address. The code expires in 15 minutes.</p>
        <div style="font-size:2rem;font-weight:bold;color:#6c5ce7;background:#f5f5f5;padding:15px;text-align:center;border-radius:6px;letter-spacing:5px;margin:15px 0;">
          ${otp}
        </div>
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

/**
 * Send a collaboration invite email.
 * @param {string} to           - Recipient email address
 * @param {string} inviterName  - Name of the inviter
 * @param {string} role         - Role assigned ('viewer' or 'editor')
 * @param {string} link         - Join/Register link
 */
export async function sendCollaborationInviteEmail(to, inviterName, role, link) {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '"DecisionVault" <noreply@decisionvault.dev>',
    to,
    subject: `Invite to collaborate on ${inviterName}'s college shortlist`,
    text: `Hello! ${inviterName} has invited you to collaborate as a ${role} on their college shortlist. Join/accept by visiting: ${link}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;border:1px solid #ddd;padding:20px;border-radius:8px;">
        <h2 style="color:#6c5ce7;margin-top:0;">DecisionVault — Collaboration Invite</h2>
        <p><strong>${inviterName}</strong> has invited you to collaborate as a <strong>${role}</strong> on their college shortlist.</p>
        <p>Click the button below to accept the invitation and access their workspace:</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6c5ce7;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
          Accept Invitation
        </a>
        <p style="margin-top:16px;color:#888;font-size:0.8rem;">
          Or copy this link: <a href="${link}">${link}</a>
        </p>
      </div>
    `,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[Mailer] Collaboration invite email preview: ${previewUrl}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const filePath = path.join(process.cwd(), 'invite_debug.txt');
      fs.writeFileSync(filePath, `To: ${to}\nInviter: ${inviterName}\nRole: ${role}\nLink: ${link}\nPreview Email: ${previewUrl || 'none'}\nSent At: ${new Date().toLocaleTimeString()}\n`);
      console.log(`[Invite Debug] Wrote invite details to ${filePath}`);
    } catch (err) {
      console.error('[Invite Debug] Failed to write invite_debug.txt:', err.message);
    }
  }

  return info;
}

export async function verifySMTP() {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    console.log('[Mailer] SMTP connection verified successfully! Ready to send emails.');
  } catch (err) {
    console.error('[Mailer] SMTP verification failed:', err.message);
  }
}
