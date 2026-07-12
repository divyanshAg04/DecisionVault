import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { College } from '../src/models/College.js';
import { Decision } from '../src/models/Decision.js';
import { TEST_CSRF_TOKEN, makeTestCookies } from './csrfHelper.js';
import './setup.js';

describe('Decision Routes & Export Endpoints', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should allow user to lock decision, fetch decisions, and export by ID', async () => {
    const user = await User.create({ name: 'Decision User', email: 'd@example.com', passwordHash: 'hash', emailVerified: true });
    const college = await College.create({
      name: 'Decision IIT',
      shortName: 'DIIT',
      type: 'IIT',
      branch: 'CSE',
      state: 'Delhi',
      city: 'Delhi',
      cutoff: 500,
      fees: 220000,
      avgPackage: 20.5,
      medianPackage: 18.0,
      placementRate: 98,
      nirfRank: 5,
      distanceKm: 30,
      campusLife: 9.0,
      faculty: 9.5,
      research: 9.0,
      roi: 9.2,
      pros: [],
      cons: [],
      researchLinks: []
    });

    const authCookie = makeAuthCookie(user._id);

    // 1. Create Decision
    const createRes = await request(app)
      .post('/api/decisions')
      .set('Cookie', makeTestCookies(authCookie))
      .set('X-CSRF-Token', TEST_CSRF_TOKEN)
      .send({
        selectedCollege: college._id.toString(),
        finalScore: 95,
        confidence: 90,
        reasons: ['Top tier college', 'Elite placements'],
        reviewDueAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.decision).toBeDefined();
    expect(createRes.body.decision.finalScore).toBe(95);
    const decisionId = createRes.body.decision._id;

    // 2. Fetch all decisions
    const getRes = await request(app)
      .get('/api/decisions')
      .set('Cookie', authCookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.decisions.length).toBe(1);
    expect(getRes.body.decisions[0]._id).toBe(decisionId);

    // 3. Export all decisions (JSON)
    const exportJsonAll = await request(app)
      .get('/api/decisions/export')
      .set('Cookie', authCookie);

    expect(exportJsonAll.status).toBe(200);
    expect(exportJsonAll.header['content-type']).toContain('application/json');
    expect(exportJsonAll.body.decisions).toBeDefined();

    // 4. Export all decisions (CSV)
    const exportCsvAll = await request(app)
      .get('/api/decisions/export?format=csv')
      .set('Cookie', authCookie);

    expect(exportCsvAll.status).toBe(200);
    expect(exportCsvAll.header['content-type']).toContain('text/csv');
    expect(exportCsvAll.text).toContain('collegeName,shortName,program,finalScore,confidence,reasons,decisionDate,reviewDueAt');
    expect(exportCsvAll.text).toContain('Decision IIT');

    // 5. Export single decision by ID (JSON)
    const exportJsonSingle = await request(app)
      .get(`/api/decisions/${decisionId}/export`)
      .set('Cookie', authCookie);

    expect(exportJsonSingle.status).toBe(200);
    expect(exportJsonSingle.header['content-type']).toContain('application/json');
    expect(exportJsonSingle.body.decision).toBeDefined();
    expect(exportJsonSingle.body.decision._id).toBe(decisionId);

    // 6. Export single decision by ID (CSV)
    const exportCsvSingle = await request(app)
      .get(`/api/decisions/${decisionId}/export?format=csv`)
      .set('Cookie', authCookie);

    expect(exportCsvSingle.status).toBe(200);
    expect(exportCsvSingle.header['content-type']).toContain('text/csv');
    expect(exportCsvSingle.text).toContain('Decision IIT');

    // 7. Export non-existent decision ID -> 404
    const exportNotFound = await request(app)
      .get(`/api/decisions/664b4cbe45ef3d944c680db9/export`)
      .set('Cookie', authCookie);

    expect(exportNotFound.status).toBe(404);
  });
});
