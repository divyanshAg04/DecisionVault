import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { Shortlist } from '../src/models/Shortlist.js';
import { TEST_CSRF_TOKEN, makeTestCookies } from './csrfHelper.js';
import './setup.js';

describe('Account Deletion Transaction', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should roll back deletions if one of the writes fails', async () => {
    const user = await User.create({ name: 'User A', email: 'a@example.com', passwordHash: 'hash' });
    
    // Create a shortlist item for the user
    await Shortlist.create({
      user: user._id,
      college: user._id, // dummy ID is fine for validation
      confidence: 70,
      status: 'shortlisted'
    });

    // Mock User.findByIdAndDelete to throw an error when called
    const spy = vi.spyOn(User, 'findByIdAndDelete').mockImplementationOnce(() => {
      throw new Error('Database write error');
    });

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Cookie', makeTestCookies(makeAuthCookie(user._id)))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN);

    // The request should fail with 500
    expect(res.status).toBe(500);

    // Verify User STILL EXISTS because the transaction rolled back!
    const userStillExists = await User.findById(user._id);
    expect(userStillExists).not.toBeNull();

    // Verify Shortlist STILL EXISTS
    const shortlistStillExists = await Shortlist.findOne({ user: user._id });
    expect(shortlistStillExists).not.toBeNull();

    spy.mockRestore();
  });

  it('should successfully delete all user data on happy path', async () => {
    const user = await User.create({ name: 'User A', email: 'a@example.com', passwordHash: 'hash' });
    
    await Shortlist.create({
      user: user._id,
      college: user._id,
      confidence: 70,
      status: 'shortlisted'
    });

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Cookie', makeTestCookies(makeAuthCookie(user._id)))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN);

    expect(res.status).toBe(200);

    // Verify everything is deleted
    const userDeleted = await User.findById(user._id);
    expect(userDeleted).toBeNull();

    const shortlistDeleted = await Shortlist.findOne({ user: user._id });
    expect(shortlistDeleted).toBeNull();
  });
});
