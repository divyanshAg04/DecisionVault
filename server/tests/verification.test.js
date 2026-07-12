import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import './setup.js';

vi.mock('../src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
  sendCollaborationInviteEmail: vi.fn().mockResolvedValue(true),
}));

describe('Email Verification Actions Restrictions', () => {
  const registerAndGetCookie = async (email, verified = false) => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email, password: 'Password123', examTrack: 'JEE' });
    expect(regRes.status).toBe(201);

    if (verified) {
      await User.updateOne({ email }, { emailVerified: true });
    }

    const cookies = regRes.headers['set-cookie'] || [];
    const tokenCookie = cookies.find((c) => c.startsWith('token='));
    const token = tokenCookie?.split(';')[0]?.split('=')[1];
    const csrfCookie = cookies.find((c) => c.startsWith('csrfToken='));
    const csrfToken = csrfCookie?.split(';')[0]?.split('=')[1];
    return { token, cookieHeader: `token=${token}; csrfToken=${csrfToken}`, csrfToken };
  };

  it('should block unverified user from adding a shortlist item', async () => {
    const { cookieHeader, csrfToken } = await registerAndGetCookie('unverified@example.com', false);

    const res = await request(app)
      .post('/api/shortlists')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ college: '6a476c85ba8bd60d1168ef4e' }); // arbitrary ID

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('verification is required');
  });

  it('should allow verified user to add a shortlist item', async () => {
    const { cookieHeader, csrfToken } = await registerAndGetCookie('verified@example.com', true);

    const res = await request(app)
      .post('/api/shortlists')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ college: '6a476da431bd810922a521fc' }); // valid dummy ID or arbitrary

    // Status will be either 201 (if item/college exists/created) or 404 (if college not found), 
    // but not 403 Forbidden!
    expect(res.status).not.toBe(403);
  });

  it('should block unverified user from asking AI counselor', async () => {
    const { cookieHeader, csrfToken } = await registerAndGetCookie('unverified_ai@example.com', false);

    const res = await request(app)
      .post('/api/ai/ask')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ question: 'Should I choose CS at IIT?' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('verification is required');
  });

  it('should generate a 6-digit OTP on registration and verify it via POST /verify-email', async () => {
    const { cookieHeader, csrfToken } = await registerAndGetCookie('otp_test@example.com', false);

    // Fetch the user's OTP from the database
    const user = await User.findOne({ email: 'otp_test@example.com' });
    expect(user.emailVerificationToken).toBeDefined();
    expect(user.emailVerificationToken).toHaveLength(6);
    expect(user.emailVerificationExpires).toBeDefined();
    expect(user.emailVerified).toBe(false);

    // Submit the OTP via the verify-email endpoint
    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ otp: user.emailVerificationToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.message).toContain('verified');
    expect(verifyRes.body.user.emailVerified).toBe(true);

    // Confirm user is now verified in the database
    const updatedUser = await User.findOne({ email: 'otp_test@example.com' });
    expect(updatedUser.emailVerified).toBe(true);
    expect(updatedUser.emailVerificationToken).toBeNull();
  });

  it('should reject an invalid or expired OTP code', async () => {
    const { cookieHeader, csrfToken } = await registerAndGetCookie('otp_bad@example.com', false);

    // Submit a wrong OTP
    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ otp: '000000' });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.message).toContain('Invalid or expired');

    // Confirm user is still unverified
    const user = await User.findOne({ email: 'otp_bad@example.com' });
    expect(user.emailVerified).toBe(false);
  });

  it('should resend a new OTP code via POST /resend-verification', async () => {
    const { cookieHeader, csrfToken } = await registerAndGetCookie('otp_resend@example.com', false);

    const userBefore = await User.findOne({ email: 'otp_resend@example.com' });
    const oldOtp = userBefore.emailVerificationToken;

    const resendRes = await request(app)
      .post('/api/auth/resend-verification')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken);

    expect(resendRes.status).toBe(200);
    expect(resendRes.body.message).toContain('resent');

    const userAfter = await User.findOne({ email: 'otp_resend@example.com' });
    expect(userAfter.emailVerificationToken).toHaveLength(6);
    expect(userAfter.emailVerificationToken).not.toBe(oldOtp);

    // Verify the new OTP works
    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ otp: userAfter.emailVerificationToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.emailVerified).toBe(true);
  });
});
