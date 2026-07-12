import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import './setup.js';

vi.mock('../src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
  sendCollaborationInviteEmail: vi.fn().mockResolvedValue(true),
}));

describe('Refresh Token Rotation', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const registerAndLogin = async (email) => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email, password: 'Password123', examTrack: 'JEE' });
    expect(regRes.status).toBe(201);
    // Extract refresh token from Set-Cookie header
    const cookies = regRes.headers['set-cookie'] || [];
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    const refreshToken = refreshCookie?.split(';')[0]?.split('=')[1];
    return { regRes, refreshToken, cookies };
  };

  it('should issue a refresh token cookie on login', async () => {
    const { cookies } = await registerAndLogin('rtlogin@example.com');
    const hasRefreshToken = cookies.some((c) => c.startsWith('refreshToken='));
    expect(hasRefreshToken).toBe(true);
  });

  it('should rotate refresh token on POST /api/auth/refresh', async () => {
    const { refreshToken } = await registerAndLogin('rtrotate@example.com');
    expect(refreshToken).toBeDefined();

    // Use old refresh token to get a new pair
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.message).toBe('Token refreshed successfully');

    // Verify old token is now revoked in DB
    const oldStored = await RefreshToken.findOne({ token: refreshToken });
    expect(oldStored.revoked).toBe(true);
    expect(oldStored.replacedByToken).toBeDefined();

    // Verify a new refresh cookie was issued
    const newCookies = refreshRes.headers['set-cookie'] || [];
    expect(newCookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('should reject reuse of a revoked refresh token', async () => {
    const { refreshToken } = await registerAndLogin('rtreuse@example.com');

    // Rotate once (first use — valid)
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    // Reuse the same (now revoked) token
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.message).toContain('invalid or expired');
  });

  it('should revoke refresh token on logout', async () => {
    const { cookies, refreshToken } = await registerAndLogin('rtlogout@example.com');

    // Extract CSRF token from register cookies
    const csrfCookie = cookies.find(c => c.startsWith('csrfToken='));
    const csrfToken = csrfCookie?.split(';')[0]?.split('=')[1];

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies.join('; '))
      .set('X-CSRF-Token', csrfToken);

    const stored = await RefreshToken.findOne({ token: refreshToken });
    expect(stored.revoked).toBe(true);
  });
});
