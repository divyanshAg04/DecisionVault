import express from 'express';
import { College } from '../models/College.js';
import { getCached, setCached } from '../utils/cache.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const cacheKey = `colleges:${JSON.stringify(req.query)}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      console.log(`[CACHE HIT] Serving colleges from memory cache`);
      return res.json({ colleges: cachedData });
    }

    const { q, state, branch, hostel, maxFees, minPackage } = req.query;
    const filter = {};

    if (q) filter.$text = { $search: q };
    if (state) filter.state = state;
    if (branch) filter.branch = branch;
    if (hostel === 'true') filter.hostel = true;
    if (maxFees) filter.fees = { $lte: Number(maxFees) };
    if (minPackage) filter.avgPackage = { $gte: Number(minPackage) };

    const colleges = await College.find(filter).sort({ avgPackage: -1, fees: 1 });
    setCached(cacheKey, colleges, 300);
    console.log(`[CACHE MISS] Querying database for colleges`);
    return res.json({ colleges });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const college = await College.findById(req.params.id);

    if (!college) {
      return res.status(404).json({ message: 'College not found' });
    }

    return res.json({ college });
  } catch (error) {
    return next(error);
  }
});

export default router;
