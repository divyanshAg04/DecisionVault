import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ActivityLog } from '../models/ActivityLog.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const activities = await ActivityLog.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    return res.json({ activities });
  } catch (error) {
    return next(error);
  }
});

export default router;
