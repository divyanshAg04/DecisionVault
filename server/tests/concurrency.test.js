import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import jwt from 'jsonwebtoken';
import { TEST_CSRF_TOKEN, makeTestCookies } from './csrfHelper.js';
import './setup.js';

// Spy on/mock child_process.execFile
vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    execFile: vi.fn((file, args, options, callback) => {
      // If it is calling predict_placement.py, delay the response
      if (args && args[0] && args[0].includes('predict_placement.py')) {
        setTimeout(() => {
          callback(null, {
            stdout: JSON.stringify({
              status: 'Success',
              placedProbability: 0.9,
              expectedPackageLpa: 15.0,
              expectedPackageMin: 12.0,
              expectedPackageMax: 18.0,
              dataDisclaimer: 'Trained on synthetic data; illustrative only, not a real placement guarantee'
            }),
            stderr: ''
          });
        }, 500); // 500ms mock delay
      } else {
        // Fallback to original behavior or immediate callback
        if (typeof callback === 'function') {
          callback(null, { stdout: '{}', stderr: '' });
        } else if (typeof options === 'function') {
          options(null, { stdout: '{}', stderr: '' });
        }
      }
    })
  };
});

describe('Subprocess Concurrency', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should not block the event loop while Python is executing', async () => {
    const user = await User.create({ name: 'Concurrency User', email: 'c@example.com', passwordHash: 'hash', emailVerified: true });
    const authCookie = makeAuthCookie(user._id);

    // Track response order
    const events = [];

    // Trigger the slow prediction request
    const predictPromise = request(app)
      .post('/api/ml/predict-placement')
      .set('Cookie', makeTestCookies(authCookie))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN)
      .send({
        gender: 'Male',
        age: 21,
        degree: 'BTech',
        branch: 'CS',
        cgpa: 9.0
      })
      .then((res) => {
        events.push({ name: 'predict', time: Date.now() });
        return res;
      });

    // Short timeout to guarantee that the prediction subprocess has started
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Fire the health check request concurrently
    const healthPromise = request(app)
      .get('/api/health')
      .then((res) => {
        events.push({ name: 'health', time: Date.now() });
        return res;
      });

    // Await both
    const [predictRes, healthRes] = await Promise.all([predictPromise, healthPromise]);

    expect(healthRes.status).toBe(200);
    expect(predictRes.status).toBe(200);

    // Verify order of events: health check must respond FIRST because predict takes 500ms
    expect(events[0].name).toBe('health');
    expect(events[1].name).toBe('predict');

    // Confirm that the time difference is at least 300ms
    const diff = events[1].time - events[0].time;
    expect(diff).toBeGreaterThanOrEqual(300);
  });
});
