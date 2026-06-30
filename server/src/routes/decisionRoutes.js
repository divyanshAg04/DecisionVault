import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Decision } from '../models/Decision.js';
import { Reflection } from '../models/Reflection.js';
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
    .optional(),
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

router.get('/', async (req, res, next) => {
  try {
    const decisions = await Decision.find({ user: req.user._id }).populate('selectedCollege').sort({ createdAt: -1 });
    return res.json({ decisions });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = decisionSchema.parse(req.body);
    if (!input.selectedCollege && !input.selectedCollegeSnapshot?.name) {
      return res.status(400).json({ message: 'College decision details are required' });
    }

    const decision = await Decision.create({ ...input, user: req.user._id });
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

router.post('/reflections', async (req, res, next) => {
  try {
    const input = reflectionSchema.parse(req.body);
    const decision = await Decision.findOne({ _id: input.decision, user: req.user._id });

    if (!decision) {
      return res.status(404).json({ message: 'Decision not found' });
    }

    const reflection = await Reflection.create({ ...input, user: req.user._id });
    await logActivity(req.user._id, 'reflection_add', `Submitted 6-month retrospective reflection on college choice`);
    return res.status(201).json({ reflection });
  } catch (error) {
    return next(error);
  }
});

export default router;
