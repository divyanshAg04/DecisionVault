import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { getCached } from '../src/utils/cache.js';
import { TEST_CSRF_TOKEN, makeTestCookies } from './csrfHelper.js';
import './setup.js';

vi.mock('../src/utils/geminiClient.js', () => ({
  callGemini: vi.fn().mockResolvedValue({
    answer: "Mocked Gemini counselor answer",
    pros: ["Mocked pro"],
    cons: ["Mocked con"],
    confidence: 85
  }),
}));

describe('AI Routes Rate Limiting and Caching', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should rate limit requests per-user and not affect other users', async () => {
    const userA = await User.create({ name: 'User A', email: 'a@example.com', passwordHash: 'hash', emailVerified: true });
    const userB = await User.create({ name: 'User B', email: 'b@example.com', passwordHash: 'hash', emailVerified: true });

    const cookieA = makeAuthCookie(userA._id);
    const cookieB = makeAuthCookie(userB._id);

    // User A makes 5 requests (all should be 400 validation error, not 429)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/ai/ask')
        .set('Cookie', makeTestCookies(cookieA))
        .set('X-CSRF-Token', TEST_CSRF_TOKEN)
        .send({}); // Invalid body triggers validation
      expect(res.status).toBe(400);
    }

    // User A's 6th request should be rate-limited (429)
    const resA6 = await request(app)
      .post('/api/ai/ask')
      .set('Cookie', makeTestCookies(cookieA))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN)
      .send({});
    expect(resA6.status).toBe(429);
    expect(resA6.body.message).toContain('rate limit exceeded');

    // User B should still be allowed to make requests (should be 400, not 429)
    const resB = await request(app)
      .post('/api/ai/ask')
      .set('Cookie', makeTestCookies(cookieB))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN)
      .send({});
    expect(resB.status).toBe(400);
  });

  it('should cache repeated identical Q&A queries per user', async () => {
    const user = await User.create({ name: 'Cache User', email: 'cache@example.com', passwordHash: 'hash', emailVerified: true });
    const authCookie = makeAuthCookie(user._id);

    // First Q&A request
    const res1 = await request(app)
      .post('/api/ai/ask')
      .set('Cookie', makeTestCookies(authCookie))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN)
      .send({ question: 'How is the hostel mess here?' });

    expect(res1.status).toBe(200);
    expect(res1.body.answer).toBeDefined();

    // Verify cache has stored the result under the user's key
    const cacheKey = `ask:${user._id}:how is the hostel mess here?`;
    const cached = getCached(cacheKey);
    expect(cached).not.toBeNull();
    expect(cached.answer).toBe(res1.body.answer);

    // Second Q&A request should hit cache (we make it and expect 200)
    const res2 = await request(app)
      .post('/api/ai/ask')
      .set('Cookie', makeTestCookies(authCookie))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN)
      .send({ question: 'How is the hostel mess here?' });

    expect(res2.status).toBe(200);
    expect(res2.body.answer).toBe(res1.body.answer);
  });
});
