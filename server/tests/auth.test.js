import { describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import './setup.js';

describe('Auth Routes', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should reject registration with a duplicate email', async () => {
    await User.create({
      name: 'Existing User',
      email: 'test@example.com',
      passwordHash: 'somehash',
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Another User',
        email: 'test@example.com',
        password: 'password123',
      });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already registered');
  });

  it('should login an existing user successfully', async () => {
    const hash = await bcrypt.hash('password123', 12);
    await User.create({
      name: 'Login User',
      email: 'login@example.com',
      passwordHash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login@example.com',
        password: 'password123',
      });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should reject login with incorrect credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Invalid credentials');
  });

  it('should process base64 scorecard upload, save local URL, and run OCR auto-fill', async () => {
    const user = await User.create({ name: 'OCR User', email: 'ocr@example.com', passwordHash: 'hash' });
    const authCookie = `token=${jwt.sign({ userId: user._id }, jwtSecret)}`;

    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', authCookie)
      .send({
        scorecardBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        scorecardName: 'test_scorecard.png'
      });

    expect(res.status).toBe(200);
    expect(res.body.user.scorecardUrl).toBeDefined();
    expect(res.body.user.scorecardUrl).toContain('/uploads/');
    
    // Verify it saved to database correctly
    const freshUser = await User.findById(user._id);
    expect(freshUser.scorecardUrl).toBeDefined();
    expect(freshUser.scorecardUrl).toContain('/uploads/');
    expect(freshUser.scorecardBase64).toBeUndefined(); // Base64 should not exist on document
  }, 30000);
});
