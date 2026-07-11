import express from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { College } from '../models/College.js';
import { Shortlist } from '../models/Shortlist.js';
import { Invitation } from '../models/Invitation.js';
import { User } from '../models/User.js';
import { logActivity } from '../utils/activityLogger.js';

const router = express.Router();

const shortlistSchema = z.object({
  college: z.string().min(1),
  confidence: z.number().min(0).max(100).default(50),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  priorities: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        weight: z.number().min(1).max(5),
      }),
    )
    .default([]),
  researchLinks: z
    .array(
      z.object({
        label: z.string(),
        type: z.string(),
        url: z.string(),
      }),
    )
    .default([]),
});

const noteSchema = z.object({
  body: z.string().min(2),
  source: z.string().optional(),
});

const predictionShortlistSchema = z.object({
  institute: z.string().min(1),
  program: z.string().min(1),
  quota: z.string().default('AI'),
  seatType: z.string().default('OPEN'),
  gender: z.string().default('Gender-Neutral'),
  openingRank: z.coerce.number().int().nonnegative().default(0),
  closingRank: z.coerce.number().int().nonnegative().default(0),
  probability: z.coerce.number().min(0).max(100).default(0),
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

// GET all shortlists
router.get('/', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const shortlists = await Shortlist.find({ user: req.workspaceOwnerId })
      .populate('college')
      .sort({ updatedAt: -1 });
    return res.json({ shortlists });
  } catch (error) {
    return next(error);
  }
});

// GET /export
router.get('/export', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const format = req.query.format || 'json';
    const shortlists = await Shortlist.find({ user: req.workspaceOwnerId })
      .populate('college')
      .sort({ updatedAt: -1 });

    if (format === 'csv') {
      const fields = [
        'collegeName',
        'shortName',
        'branch',
        'fees',
        'avgPackage',
        'medianPackage',
        'placementRate',
        'confidence',
        'status',
        'pros',
        'cons',
        'notes',
      ];

      const rows = shortlists.map(sl => {
        const notesStr = sl.notes.map(n => `[${n.authorName || 'User'}]: ${n.body}`).join(' | ');
        return {
          collegeName: sl.college?.name || '',
          shortName: sl.college?.shortName || '',
          branch: sl.college?.branch || '',
          fees: sl.college?.fees || 0,
          avgPackage: sl.college?.avgPackage || 0,
          medianPackage: sl.college?.medianPackage || 0,
          placementRate: sl.college?.placementRate || 0,
          confidence: sl.confidence,
          status: sl.status,
          pros: sl.pros.join(' | '),
          cons: sl.cons.join(' | '),
          notes: notesStr,
        };
      });

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
      res.setHeader('Content-Disposition', `attachment; filename=shortlists-${req.workspaceOwnerId}.csv`);
      return res.send(csvContent);
    }

    // Default to JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=shortlists-${req.workspaceOwnerId}.json`);
    return res.json({ shortlists });
  } catch (error) {
    return next(error);
  }
});

// POST create/update shortlist
router.post('/', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const input = shortlistSchema.parse(req.body);

    const existing = await Shortlist.findOne({ user: req.workspaceOwnerId, college: input.college });
    const oldPros = existing ? existing.pros : [];
    const oldCons = existing ? existing.cons : [];

    const addedPros = input.pros.filter(p => !oldPros.includes(p));
    const addedCons = input.cons.filter(c => !oldCons.includes(c));

    let contributorUpdates = existing ? existing.proConContributors : [];

    for (const item of [...addedPros, ...addedCons]) {
      if (!contributorUpdates.some(c => c.item === item)) {
        contributorUpdates.push({
          item,
          addedBy: req.user._id,
          addedByName: req.user.name,
        });
      }
    }

    contributorUpdates = contributorUpdates.filter(c =>
      input.pros.includes(c.item) || input.cons.includes(c.item)
    );

    const activeCollaborators = await getWorkspaceCollaborators(req.workspaceOwnerId);

    const shortlist = await Shortlist.findOneAndUpdate(
      { user: req.workspaceOwnerId, college: input.college },
      {
        ...input,
        user: req.workspaceOwnerId,
        status: 'shortlisted',
        proConContributors: contributorUpdates,
        $set: { collaborators: activeCollaborators }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).populate('college');

    await logActivity(
      req.user._id,
      'shortlist_add',
      `Shortlisted college: ${shortlist.college?.name || 'Unknown'} (${shortlist.college?.shortName || 'Unknown'})`,
    );

    if (input.researchLinks && input.researchLinks.length > 0) {
      await logActivity(
        req.user._id,
        'link_add',
        `Added ${input.researchLinks.length} research link(s) for ${shortlist.college.shortName}`,
      );
    }

    if (input.priorities && input.priorities.length > 0) {
      await logActivity(
        req.user._id,
        'priority_update',
        `Updated priorities for ${shortlist.college.shortName}`,
      );
    }

    return res.status(201).json({ shortlist });
  } catch (error) {
    return next(error);
  }
});

router.post('/prediction', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const input = predictionShortlistSchema.parse(req.body);
    const shortCode = input.institute
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 8)
      .toUpperCase();

    const college = await College.findOneAndUpdate(
      {
        name: input.institute,
        branch: input.program,
        type: 'Cutoff dataset prediction',
      },
      {
        $set: {
          name: input.institute,
          shortName: shortCode || 'ML',
          type: 'Cutoff dataset prediction',
          branch: input.program,
          state: input.quota === 'AI' ? 'All India' : input.quota,
          city: input.quota === 'AI' ? 'All India' : input.quota,
          fees: 0,
          avgPackage: 0,
          medianPackage: 0,
          placementRate: 0,
          nirfRank: 0,
          hostel: false,
          cutoff: input.closingRank,
          distanceKm: 0,
          campusLife: 0,
          faculty: 0,
          research: 0,
          roi: 0,
          tags: ['cutoff dataset', input.quota, input.seatType, input.gender].filter(Boolean),
          pros: [
            `${input.probability}% admission signal for this rank`,
            `Closing rank ${input.closingRank} in the selected seat filter`,
          ],
          cons: ['Fees, placements, hostel, and campus details need manual verification'],
          researchLinks: [],
          cutoffSnapshot: {
            program: input.program,
            quota: input.quota,
            seatType: input.seatType,
            gender: input.gender,
            openingRank: input.openingRank,
            closingRank: input.closingRank,
            probability: input.probability,
            source: 'cutoff-dataset',
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const activeCollaborators = await getWorkspaceCollaborators(req.workspaceOwnerId);

    const shortlist = await Shortlist.findOneAndUpdate(
      { user: req.workspaceOwnerId, college: college._id },
      {
        user: req.workspaceOwnerId,
        college: college._id,
        confidence: Math.round(input.probability),
        pros: college.pros,
        cons: college.cons,
        status: 'shortlisted',
        $set: { collaborators: activeCollaborators }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).populate('college');

    await logActivity(
      req.user._id,
      'shortlist_add',
      `Saved ML prediction to shortlist: ${college.name} (${college.shortName})`,
    );

    return res.status(201).json({ shortlist });
  } catch (error) {
    return next(error);
  }
});

// POST add note
router.post('/:id/notes', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const input = noteSchema.parse(req.body);
    const noteData = {
      ...input,
      author: req.user._id,
      authorName: req.user.name,
    };

    const shortlist = await Shortlist.findOneAndUpdate(
      { _id: req.params.id, user: req.workspaceOwnerId },
      { $push: { notes: noteData } },
      { new: true },
    ).populate('college');

    if (!shortlist) {
      return res.status(404).json({ message: 'Shortlist item not found' });
    }

    await logActivity(
      req.user._id,
      'note_add',
      `Added research note for ${shortlist.college.shortName}`,
    );

    return res.json({ shortlist });
  } catch (error) {
    return next(error);
  }
});

// DELETE note
router.delete('/:id/notes/:noteId', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const shortlist = await Shortlist.findOneAndUpdate(
      { _id: req.params.id, user: req.workspaceOwnerId },
      { $pull: { notes: { _id: req.params.noteId } } },
      { new: true },
    ).populate('college');

    if (!shortlist) {
      return res.status(404).json({ message: 'Shortlist item not found' });
    }

    await logActivity(
      req.user._id,
      'note_delete',
      `Deleted a note from ${shortlist.college.shortName}`,
    );

    return res.json({ shortlist });
  } catch (error) {
    return next(error);
  }
});

// PATCH update status
router.patch('/:id/status', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const { status } = z
      .object({
        status: z.enum(['researching', 'shortlisted', 'rejected', 'selected']),
      })
      .parse(req.body);

    const shortlist = await Shortlist.findOneAndUpdate(
      { _id: req.params.id, user: req.workspaceOwnerId },
      { status },
      { new: true },
    ).populate('college');

    if (!shortlist) {
      return res.status(404).json({ message: 'Shortlist item not found' });
    }

    await logActivity(
      req.user._id,
      'shortlist_add',
      `Changed status of ${shortlist.college.shortName} to '${status}'`,
    );

    return res.json({ shortlist });
  } catch (error) {
    return next(error);
  }
});

// DELETE shortlist item
router.delete('/:id', checkWorkspaceAccess, async (req, res, next) => {
  try {
    const deleted = await Shortlist.findOneAndDelete({
      _id: req.params.id,
      user: req.workspaceOwnerId,
    }).populate('college');

    if (!deleted) {
      return res.status(404).json({ message: 'Shortlist item not found' });
    }

    await logActivity(
      req.user._id,
      'shortlist_remove',
      `Removed ${deleted.college.shortName} from shortlist`,
    );

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
