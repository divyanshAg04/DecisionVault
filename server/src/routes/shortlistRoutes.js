import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
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
