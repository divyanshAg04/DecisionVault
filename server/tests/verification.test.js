import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import './setup.js';

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
    return { token, cookieHeader: `token=${token}` };
  };

  it('should block unverified user from adding a shortlist item', async () => {
    const { cookieHeader } = await registerAndGetCookie('unverified@example.com', false);

    const res = await request(app)
      .post('/api/shortlists')
      .set('Cookie', cookieHeader)
      .send({ college: '6a476c85ba8bd60d1168ef4e' }); // arbitrary ID

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('verification is required');
  });

  it('should allow verified user to add a shortlist item', async () => {
    const { cookieHeader } = await registerAndGetCookie('verified@example.com', true);

    const res = await request(app)
      .post('/api/shortlists')
      .set('Cookie', cookieHeader)
      .send({ college: '6a476da431bd810922a521fc' }); // valid dummy ID or arbitrary

    // Status will be either 201 (if item/college exists/created) or 404 (if college not found), 
    // but not 403 Forbidden!
    expect(res.status).not.toBe(403);
  });

  it('should block unverified user from asking AI counselor', async () => {
    const { cookieHeader } = await registerAndGetCookie('unverified_ai@example.com', false);

    const res = await request(app)
      .post('/api/ai/ask')
      .set('Cookie', cookieHeader)
      .send({ question: 'Should I choose CS at IIT?' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('verification is required');
  });
});
