import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { TEST_CSRF_TOKEN, makeTestCookies } from './csrfHelper.js';
import './setup.js';

describe('ML Prediction Routes', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should return package ranges alongside predicted package on /predict-placement', async () => {
    const user = await User.create({ name: 'ML User', email: 'ml@example.com', passwordHash: 'hash' });
    const authCookie = makeAuthCookie(user._id);

    const res = await request(app)
      .post('/api/ml/predict-placement')
      .set('Cookie', makeTestCookies(authCookie))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN)
      .send({
        gender: 'Male',
        age: 21,
        degree: 'BTech',
        branch: 'CS',
        cgpa: 9.0, // High CGPA should guarantee placement probability > 0.35
        backlogs: 0,
        internships: 2,
        certifications: 3,
        codingSkills: 8,
        communicationSkills: 8,
        aptitudeScore: 85,
        projects: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.placedProbability).toBeDefined();
    expect(res.body.expectedPackageLpa).toBeDefined();
    expect(res.body.expectedPackageMin).toBeDefined();
    expect(res.body.expectedPackageMax).toBeDefined();
    expect(res.body.dataDisclaimer).toBe('Trained on synthetic data; illustrative only, not a real placement guarantee');
    
    expect(['python-sklearn', 'js-fallback', 'untrained']).toContain(res.body.modelSource);
    if (res.body.modelSource === 'js-fallback') {
      expect(res.body.isFallback).toBe(true);
      expect(res.body.confidence).toBe('low');
    }
    
    // Check range is not degenerate if student is predicted to be placed
    if (res.body.placedProbability >= 0.35 && res.body.status !== 'Model not trained') {
      expect(res.body.expectedPackageMin).toBeLessThan(res.body.expectedPackageMax);
      expect(res.body.expectedPackageMin).toBeLessThanOrEqual(res.body.expectedPackageLpa);
      expect(res.body.expectedPackageMax).toBeGreaterThanOrEqual(res.body.expectedPackageLpa);
    }
  }, 30000);
});
