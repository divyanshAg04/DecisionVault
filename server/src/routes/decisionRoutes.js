import express from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { Decision } from '../models/Decision.js';
import { Reflection } from '../models/Reflection.js';
import { Invitation } from '../models/Invitation.js';
import { User } from '../models/User.js';
import { logActivity } from '../utils/activityLogger.js';

const router = express.Router();

const decisionSchema = z.object({
  selectedCollege: z.string().min(1).optional().nullable(),
  selectedCollegeSnapshot: z
    .object({
      name: z.string().optional(),
      shortName: z.string().optional(),
      program: z.string().optional(),
      quota: z.string().optional(),
      seatType: z.string().optional(),
      gender: z.string().optional(),
      openingRank: z.number().optional(),
      closingRank: z.number().optional(),
      probability: z.number().optional(),
      source: z.string().optional(),
    })
    .optional()
    .nullable(),
  finalScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  reasons: z.array(z.string()).min(1),
  reviewDueAt: z.coerce.date(),
});

const reflectionSchema = z.object({
  decision: z.string().min(1),
  satisfaction: z.number().min(1).max(10),
  placementDataAccurate: z.boolean(),
  wouldChooseAgain: z.boolean(),
  biggestSurprise: z.string().optional(),
  biggestRegret: z.string().optional(),
});

router.use(requireAuth);

router.use((req, res, next) => {
  if (req.method !== 'GET') {
    return requireVerifiedEmail(req, res, next);
  }
  return next();
});

async function getWorkspaceCollaborators(ownerId) {
  const invites = await Invitation.find({ sender: ownerId, status: 'accepted' });
  const collaborators = [];
  for (const invite of invites) {
    const u = await User.findOne({ email: invite.inviteeEmail }).select('_id');
    if (u) {
      collaborators.push({ user: u._id, role: invite.role });
    }
  }
  return collaborators;
}

async function checkWorkspaceAccess(req, res, next) {
  try {
    const targetUserId = req.query.userId || req.body.userId;

    if (targetUserId && targetUserId !== req.user._id.toString()) {
      const invitation = await Invitation.findOne({
        sender: targetUserId,
        inviteeEmail: req.user.email.toLowerCase(),
        status: 'accepted',
      });

      if (!invitation) {
        return res.status(403).json({ message: 'Access to this workspace is unauthorized' });
      }

      if (req.method !== 'GET' && invitation.role === 'viewer') {
        return res.status(403).json({ message: 'You have read-only access to this workspace' });
      }

      req.workspaceOwnerId = invitation.sender;
      req.workspaceRole = invitation.role;
    } else {
      req.workspaceOwnerId = req.user._id;
      req.workspaceRole = 'owner';
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

// GET all decisions
router.get('/', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const decisions = await Decision.find({ user: req.workspaceOwnerId }).populate('selectedCollege').sort({ createdAt: -1 });
    return res.json({ decisions });
  } catch (error) {
    return next(error);
  }
});

// GET /export
router.get('/export', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const format = req.query.format || 'json';
    const decisions = await Decision.find({ user: req.workspaceOwnerId })
      .populate('selectedCollege')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      const fields = [
        'collegeName',
        'shortName',
        'program',
        'finalScore',
        'confidence',
        'reasons',
        'decisionDate',
        'reviewDueAt',
      ];

      const rows = decisions.map(d => ({
        collegeName: d.selectedCollege?.name || d.selectedCollegeSnapshot?.name || '',
        shortName: d.selectedCollege?.shortName || d.selectedCollegeSnapshot?.shortName || '',
        program: d.selectedCollege?.branch || d.selectedCollegeSnapshot?.program || '',
        finalScore: d.finalScore,
        confidence: d.confidence,
        reasons: d.reasons.join(' | '),
        decisionDate: d.decisionDate ? d.decisionDate.toISOString() : '',
        reviewDueAt: d.reviewDueAt ? d.reviewDueAt.toISOString() : '',
      }));

      // Custom robust CSV converter
      let csvContent = fields.join(',') + '\r\n';
      for (const row of rows) {
        const line = fields.map(field => {
          let val = row[field];
          if (val === undefined || val === null) {
            val = '';
          } else {
            val = String(val).replace(/"/g, '""');
            if (val.includes(',') || val.includes('\n') || val.includes('\r')) {
              val = `"${val}"`;
            }
          }
          return val;
        }).join(',');
        csvContent += line + '\r\n';
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=decisions-${req.workspaceOwnerId}.csv`);
      return res.send(csvContent);
    }

    // Default JSON response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=decisions-${req.workspaceOwnerId}.json`);
    return res.json({ decisions });
  } catch (error) {
    return next(error);
  }
});

// POST save decision
router.post('/', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const input = decisionSchema.parse(req.body);
    if (!input.selectedCollege && !input.selectedCollegeSnapshot?.name) {
      return res.status(400).json({ message: 'College decision details are required' });
    }

    const activeCollaborators = await getWorkspaceCollaborators(req.workspaceOwnerId);

    const decision = await Decision.create({
      ...input,
      user: req.workspaceOwnerId,
      collaborators: activeCollaborators
    });

    if (decision.selectedCollege) {
      await decision.populate('selectedCollege');
    }

    const name = decision.selectedCollege?.name || decision.selectedCollegeSnapshot?.name || 'dataset result';
    const shortName = decision.selectedCollege?.shortName || decision.selectedCollegeSnapshot?.shortName || 'cutoff';
    await logActivity(req.user._id, 'decision_confirm', `Confirmed final college decision: ${name} (${shortName})`);
    return res.status(201).json({ decision });
  } catch (error) {
    return next(error);
  }
});

// POST reflections
router.post('/reflections', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const input = reflectionSchema.parse(req.body);
    const decision = await Decision.findOne({ _id: input.decision, user: req.workspaceOwnerId });

    if (!decision) {
      return res.status(404).json({ message: 'Decision not found' });
    }

    const reflection = await Reflection.create({ ...input, user: req.workspaceOwnerId });
    await logActivity(req.user._id, 'reflection_add', `Submitted 6-month retrospective reflection on college choice`);
    return res.status(201).json({ reflection });
  } catch (error) {
    return next(error);
  }
});

export default router;
