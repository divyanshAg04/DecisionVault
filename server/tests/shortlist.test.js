import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { College } from '../src/models/College.js';
import { Shortlist } from '../src/models/Shortlist.js';
import './setup.js';

describe('Shortlist Routes Scoping & CRUD', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should allow user to CRUD their own shortlist items', async () => {
    const user = await User.create({ name: 'User A', email: 'a@example.com', passwordHash: 'hash', emailVerified: true });
    const college = await College.create({
      name: 'Test University',
      shortName: 'TU',
      type: 'IIT',
      branch: 'CSE',
      state: 'Delhi',
      city: 'Delhi',
      cutoff: 1000,
      fees: 200000,
      avgPackage: 15.5,
      medianPackage: 12.0,
      placementRate: 95,
      nirfRank: 15,
      distanceKm: 50,
      campusLife: 8.5,
      faculty: 9.0,
      research: 8.0,
      roi: 8.5,
      pros: [],
      cons: [],
      researchLinks: []
    });

    const authCookie = makeAuthCookie(user._id);

    // 1. Create/Add to Shortlist
    const addRes = await request(app)
      .post('/api/shortlists')
      .set('Cookie', authCookie)
      .send({
        college: college._id.toString(),
        confidence: 80,
        pros: ['Great culture'],
        cons: ['High fees']
      });

    expect(addRes.status).toBe(201);
    expect(addRes.body.shortlist).toBeDefined();
    expect(addRes.body.shortlist.confidence).toBe(80);
    const shortlistId = addRes.body.shortlist._id;

    // 2. Read shortlist
    const getRes = await request(app)
      .get('/api/shortlists')
      .set('Cookie', authCookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.shortlists.length).toBe(1);
    expect(getRes.body.shortlists[0]._id).toBe(shortlistId);

    // 3. Update shortlist status
    const statusRes = await request(app)
      .patch(`/api/shortlists/${shortlistId}/status`)
      .set('Cookie', authCookie)
      .send({ status: 'researching' });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.shortlist.status).toBe('researching');

    // 4. Add a note
    const noteRes = await request(app)
      .post(`/api/shortlists/${shortlistId}/notes`)
      .set('Cookie', authCookie)
      .send({ body: 'Seems promising', source: 'Web' });

    expect(noteRes.status).toBe(200);
    expect(noteRes.body.shortlist.notes.length).toBe(1);
    expect(noteRes.body.shortlist.notes[0].body).toBe('Seems promising');

    // 5. Delete shortlist item
    const delRes = await request(app)
      .delete(`/api/shortlists/${shortlistId}`)
      .set('Cookie', authCookie);
    expect(delRes.status).toBe(204);
  });

  it('should NOT allow a user to access or mutate another user\'s shortlist item', async () => {
    const userA = await User.create({ name: 'User A', email: 'a@example.com', passwordHash: 'hash', emailVerified: true });
    const userB = await User.create({ name: 'User B', email: 'b@example.com', passwordHash: 'hash', emailVerified: true });

    const college = await College.create({
      name: 'Security Tech',
      shortName: 'ST',
      type: 'NIT',
      branch: 'ECE',
      state: 'Goa',
      city: 'Goa',
      cutoff: 5000,
      fees: 150000,
      avgPackage: 10.5,
      medianPackage: 8.0,
      placementRate: 90,
      nirfRank: 35,
      distanceKm: 600,
      campusLife: 7.5,
      faculty: 8.0,
      research: 7.0,
      roi: 7.5,
      pros: [],
      cons: [],
      researchLinks: []
    });

    // Shortlist item belonging to User A
    const shortlistA = await Shortlist.create({
      user: userA._id,
      college: college._id,
      confidence: 70,
      status: 'shortlisted'
    });

    const cookieB = makeAuthCookie(userB._id);

    // 1. User B tries to update User A's shortlist status -> expect 404
    const statusRes = await request(app)
      .patch(`/api/shortlists/${shortlistA._id}/status`)
      .set('Cookie', cookieB)
      .send({ status: 'rejected' });
    expect(statusRes.status).toBe(404);

    // 2. User B tries to add a note to User A's shortlist -> expect 404
    const noteRes = await request(app)
      .post(`/api/shortlists/${shortlistA._id}/notes`)
      .set('Cookie', cookieB)
      .send({ body: 'Hijacked note' });
    expect(noteRes.status).toBe(404);

    // 3. User B tries to delete User A's shortlist -> expect 404
    const delRes = await request(app)
      .delete(`/api/shortlists/${shortlistA._id}`)
      .set('Cookie', cookieB);
    expect(delRes.status).toBe(404);

    // Verify Shortlist item still exists untouched
    const fresh = await Shortlist.findById(shortlistA._id);
    expect(fresh).toBeDefined();
    expect(fresh.status).toBe('shortlisted');
  });
});
