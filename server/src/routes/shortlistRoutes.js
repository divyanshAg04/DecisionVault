import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { College } from '../models/College.js';
import { Shortlist } from '../models/Shortlist.js';
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

// GET all shortlists
router.get('/', async (req, res, next) => {
  try {
    const shortlists = await Shortlist.find({ user: req.user._id })
      .populate('college')
      .sort({ updatedAt: -1 });
    return res.json({ shortlists });
  } catch (error) {
    return next(error);
  }
});

// POST create/update shortlist
router.post('/', async (req, res, next) => {
  try {
    const input = shortlistSchema.parse(req.body);
    const shortlist = await Shortlist.findOneAndUpdate(
      { user: req.user._id, college: input.college },
      { ...input, user: req.user._id, status: 'shortlisted' },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).populate('college');

    await logActivity(
      req.user._id,
      'shortlist_add',
      `Shortlisted college: ${shortlist.college.name} (${shortlist.college.shortName})`,
    );

    // Log research links agar add kiye hain
    if (input.researchLinks && input.researchLinks.length > 0) {
      await logActivity(
        req.user._id,
        'link_add',
        `Added ${input.researchLinks.length} research link(s) for ${shortlist.college.shortName}`,
      );
    }

    // Log priority update agar priorities hain
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

router.post('/prediction', async (req, res, next) => {
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

    const shortlist = await Shortlist.findOneAndUpdate(
      { user: req.user._id, college: college._id },
      {
        user: req.user._id,
        college: college._id,
        confidence: Math.round(input.probability),
        pros: college.pros,
        cons: college.cons,
        status: 'shortlisted',
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
router.post('/:id/notes', async (req, res, next) => {
  try {
    const input = noteSchema.parse(req.body);
    const shortlist = await Shortlist.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $push: { notes: input } },
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

// DELETE note — NEW
router.delete('/:id/notes/:noteId', async (req, res, next) => {
  try {
    const shortlist = await Shortlist.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
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
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = z
      .object({
        status: z.enum(['researching', 'shortlisted', 'rejected', 'selected']),
      })
      .parse(req.body);

    const shortlist = await Shortlist.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
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
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Shortlist.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
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
