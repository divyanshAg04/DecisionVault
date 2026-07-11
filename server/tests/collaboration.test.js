import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { User } from '../src/models/User.js';
import { College } from '../src/models/College.js';
import { Shortlist } from '../src/models/Shortlist.js';
import { Invitation } from '../src/models/Invitation.js';
import { Decision } from '../src/models/Decision.js';
import './setup.js';

vi.mock('../src/utils/mailer.js', () => ({
  sendCollaborationInviteEmail: vi.fn().mockResolvedValue(true),
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

describe('Collaboration and Scoped Workspace Access Routes', () => {
  const jwtSecret = process.env.JWT_SECRET || 'test-secret';

  const makeAuthCookie = (userId) => {
    const token = jwt.sign({ userId }, jwtSecret);
    return `token=${token}`;
  };

  it('should support inviting, responding, and revoking collaborators', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@example.com', passwordHash: 'hash', emailVerified: true });
    const collaborator = await User.create({ name: 'Collab', email: 'collab@example.com', passwordHash: 'hash', emailVerified: true });

    const ownerCookie = makeAuthCookie(owner._id);
    const collabCookie = makeAuthCookie(collaborator._id);

    // 1. Send invite
    const inviteRes = await request(app)
      .post('/api/collaborators/invite')
      .set('Cookie', ownerCookie)
      .send({ email: 'collab@example.com', role: 'viewer' });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.invitation).toBeDefined();
    expect(inviteRes.body.invitation.inviteeEmail).toBe('collab@example.com');
    expect(inviteRes.body.invitation.status).toBe('pending');
    expect(inviteRes.body.invitation.role).toBe('viewer');
    const inviteId = inviteRes.body.invitation._id;

    // 2. List invitations for recipient
    const listRes = await request(app)
      .get('/api/collaborators/invitations')
      .set('Cookie', collabCookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.received.length).toBe(1);
    expect(listRes.body.received[0]._id).toBe(inviteId);

    // 3. Accept invite
    const respondRes = await request(app)
      .post(`/api/collaborators/invitations/${inviteId}/respond`)
      .set('Cookie', collabCookie)
      .send({ accept: true });
    expect(respondRes.status).toBe(200);
    expect(respondRes.body.invitation.status).toBe('accepted');

    // 4. Verify shared workspaces list
    const sharesRes = await request(app)
      .get('/api/collaborators/shares')
      .set('Cookie', collabCookie);
    expect(sharesRes.status).toBe(200);
    expect(sharesRes.body.shares.length).toBe(1);
    expect(sharesRes.body.shares[0].user._id).toBe(owner._id.toString());
    expect(sharesRes.body.shares[0].role).toBe('viewer');

    // 5. Revoke collaboration
    const revokeRes = await request(app)
      .delete(`/api/collaborators/shares/${inviteId}`)
      .set('Cookie', ownerCookie);
    expect(revokeRes.status).toBe(204);

    const checkRevoked = await Invitation.findById(inviteId);
    expect(checkRevoked.status).toBe('declined');
  });

  it('should enforce role-based editor vs viewer checks on shared workspaces', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner2@example.com', passwordHash: 'hash', emailVerified: true });
    const viewer = await User.create({ name: 'Viewer', email: 'viewer@example.com', passwordHash: 'hash', emailVerified: true });
    const editor = await User.create({ name: 'Editor', email: 'editor@example.com', passwordHash: 'hash', emailVerified: true });

    // Establish invitations
    await Invitation.create({ sender: owner._id, inviteeEmail: 'viewer@example.com', role: 'viewer', status: 'accepted' });
    await Invitation.create({ sender: owner._id, inviteeEmail: 'editor@example.com', role: 'editor', status: 'accepted' });

    const college = await College.create({
      name: 'Collab College', shortName: 'CC', type: 'IIT', branch: 'CSE', state: 'Delhi', city: 'Delhi',
      cutoff: 100, fees: 100, avgPackage: 10, medianPackage: 10, placementRate: 90, nirfRank: 1, distanceKm: 1,
      campusLife: 10, faculty: 10, research: 10, roi: 10, pros: [], cons: [], researchLinks: []
    });

    const shortlist = await Shortlist.create({
      user: owner._id,
      college: college._id,
      confidence: 80,
      status: 'shortlisted'
    });

    const viewerCookie = makeAuthCookie(viewer._id);
    const editorCookie = makeAuthCookie(editor._id);

    // 1. Viewer reads owner's shortlist -> expect 200
    const viewRes = await request(app)
      .get(`/api/shortlists?userId=${owner._id}`)
      .set('Cookie', viewerCookie);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.shortlists.length).toBe(1);

    // 2. Viewer attempts to add a note to owner's shortlist -> expect 403 Forbidden
    const viewerNoteRes = await request(app)
      .post(`/api/shortlists/${shortlist._id}/notes?userId=${owner._id}`)
      .set('Cookie', viewerCookie)
      .send({ body: 'Viewer tried adding note' });
    expect(viewerNoteRes.status).toBe(403);

    // 3. Editor attempts to add a note to owner's shortlist -> expect 200 Success
    const editorNoteRes = await request(app)
      .post(`/api/shortlists/${shortlist._id}/notes?userId=${owner._id}`)
      .set('Cookie', editorCookie)
      .send({ body: 'Editor added note', source: 'Web' });
    expect(editorNoteRes.status).toBe(200);

    const freshShortlist = await Shortlist.findById(shortlist._id);
    expect(freshShortlist.notes.length).toBe(1);
    expect(freshShortlist.notes[0].body).toBe('Editor added note');
    expect(freshShortlist.notes[0].authorName).toBe('Editor');
  });

  it('should stream data in CSV and JSON formats from shortlists and decisions export routes', async () => {
    const user = await User.create({ name: 'User Export', email: 'export@example.com', passwordHash: 'hash', emailVerified: true });
    const cookie = makeAuthCookie(user._id);

    const college = await College.create({
      name: 'Export College', shortName: 'EC', type: 'IIT', branch: 'CSE', state: 'Delhi', city: 'Delhi',
      cutoff: 100, fees: 100, avgPackage: 10, medianPackage: 10, placementRate: 90, nirfRank: 1, distanceKm: 1,
      campusLife: 10, faculty: 10, research: 10, roi: 10, pros: [], cons: [], researchLinks: []
    });

    await Shortlist.create({
      user: user._id,
      college: college._id,
      confidence: 85,
      status: 'shortlisted',
      notes: [{ body: 'Note A', author: user._id, authorName: 'User Export' }]
    });

    await Decision.create({
      user: user._id,
      selectedCollege: college._id,
      finalScore: 92,
      confidence: 85,
      reasons: ['Reason A', 'Reason B'],
      reviewDueAt: new Date()
    });

    // 1. Export shortlists as JSON
    const shortlistJsonRes = await request(app)
      .get('/api/shortlists/export?format=json')
      .set('Cookie', cookie);
    expect(shortlistJsonRes.status).toBe(200);
    expect(shortlistJsonRes.headers['content-type']).toContain('application/json');
    expect(shortlistJsonRes.body.shortlists.length).toBe(1);
    expect(shortlistJsonRes.body.shortlists[0].confidence).toBe(85);

    // 2. Export shortlists as CSV
    const shortlistCsvRes = await request(app)
      .get('/api/shortlists/export?format=csv')
      .set('Cookie', cookie);
    expect(shortlistCsvRes.status).toBe(200);
    expect(shortlistCsvRes.headers['content-type']).toContain('text/csv');
    expect(shortlistCsvRes.text).toContain('collegeName,shortName');
    expect(shortlistCsvRes.text).toContain('Export College,EC');

    // 3. Export decisions as JSON
    const decisionJsonRes = await request(app)
      .get('/api/decisions/export?format=json')
      .set('Cookie', cookie);
    expect(decisionJsonRes.status).toBe(200);
    expect(decisionJsonRes.headers['content-type']).toContain('application/json');
    expect(decisionJsonRes.body.decisions.length).toBe(1);

    // 4. Export decisions as CSV
    const decisionCsvRes = await request(app)
      .get('/api/decisions/export?format=csv')
      .set('Cookie', cookie);
    expect(decisionCsvRes.status).toBe(200);
    expect(decisionCsvRes.headers['content-type']).toContain('text/csv');
    expect(decisionCsvRes.text).toContain('collegeName,shortName,program');
    expect(decisionCsvRes.text).toContain('Export College,EC');
  });
});
