import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import './setup.js';

describe('CSRF Protection', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should reject POST requests without CSRF token with 403', async () => {
    const user = await User.create({
      name: 'CSRF User',
      email: 'csrf@example.com',
      passwordHash: 'hash',
      emailVerified: true,
    });
    const authCookie = makeAuthCookie(user._id);

    const res = await request(app)
      .post('/api/shortlists')
      .set('Cookie', authCookie)
      .send({ college: '664b4cbe45ef3d944c680db9', confidence: 80 });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('CSRF');
  });

  it('should reject requests with mismatched CSRF token with 403', async () => {
    const user = await User.create({
      name: 'CSRF Mismatch',
      email: 'csrfmis@example.com',
      passwordHash: 'hash',
      emailVerified: true,
    });
    const authCookie = makeAuthCookie(user._id);

    const res = await request(app)
      .post('/api/shortlists')
      .set('Cookie', `${authCookie}; csrfToken=valid-token`)
      .set('X-CSRF-Token', 'wrong-token')
      .send({ college: '664b4cbe45ef3d944c680db9', confidence: 80 });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('CSRF');
  });

  it('should allow requests with valid matching CSRF token', async () => {
    const user = await User.create({
      name: 'CSRF Valid',
      email: 'csrfvalid@example.com',
      passwordHash: 'hash',
      emailVerified: true,
    });
    const authCookie = makeAuthCookie(user._id);
    const csrfToken = 'my-csrf-token-value';

    // This will pass CSRF but may fail on business logic (e.g., invalid college ObjectId).
    // The key assertion is that it does NOT get a 403.
    const res = await request(app)
      .post('/api/shortlists')
      .set('Cookie', `${authCookie}; csrfToken=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ college: '664b4cbe45ef3d944c680db9', confidence: 80 });

    // Should NOT be 403 CSRF rejection
    expect(res.status).not.toBe(403);
  });

  it('should exempt /api/auth/login and /api/auth/register from CSRF', async () => {
    // Register should work without CSRF token
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'No CSRF',
        email: 'nocsrf@example.com',
        password: 'Password123',
      });

    // Should NOT be 403 CSRF rejection
    expect(registerRes.status).not.toBe(403);
  });

  it('should reject POST /api/auth/refresh without CSRF token with 403', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send();

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('CSRF');
  });

  it('should set csrfToken cookie and return csrfToken in response body on login', async () => {
    // Create a user first
    await User.create({
      name: 'Cookie Check',
      email: 'cookiecheck@example.com',
      passwordHash: (await import('bcryptjs')).default.hashSync('Password123', 12),
      emailVerified: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cookiecheck@example.com', password: 'Password123' });

    expect(loginRes.status).toBe(200);

    // Check that csrfToken cookie was set
    const cookies = loginRes.headers['set-cookie'];
    const csrfCookie = cookies.find(c => c.startsWith('csrfToken='));
    expect(csrfCookie).toBeDefined();
    // Verify it is NOT httpOnly (should be readable by client JS)
    expect(csrfCookie).not.toContain('HttpOnly');

    // Check that csrfToken was returned in the response body
    expect(loginRes.body.csrfToken).toBeDefined();
    expect(loginRes.body.csrfToken.length).toBeGreaterThan(0);
  });

  it('should return csrfToken in GET /api/auth/me response when csrfToken cookie is present', async () => {
    const user = await User.create({
      name: 'Me Check',
      email: 'mecheck@example.com',
      passwordHash: 'hash',
      emailVerified: true,
    });

    const authCookie = makeAuthCookie(user._id);
    const csrfToken = 'test-csrf-token';

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${authCookie}; csrfToken=${csrfToken}`);

    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBe(csrfToken);
  });
});
