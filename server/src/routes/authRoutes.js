import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Shortlist } from '../models/Shortlist.js';
import { Decision } from '../models/Decision.js';
import { Reflection } from '../models/Reflection.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { parseScorecardText, extractScoreDetails } from '../utils/ocr.js';

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  examTrack: z.enum(['JEE', 'CUET', 'NEET', 'GATE', 'CAT', 'Other']).default('JEE'),
  targetYear: z.number().int().min(2026).max(2035).default(2027),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  journey: z.string().optional(),
  exam: z.string().optional(),
  scoreType: z.string().optional(),
  score: z.string().optional(),
  category: z.enum(['General', 'OBC-NCL', 'EWS', 'SC', 'ST', 'PwD']).optional(),
  homeState: z.string().optional(),
  preferredBranches: z.string().optional(),
  stream: z.string().optional(),
  budget: z.string().optional(),
  targetExam: z.string().optional(),
  scorecardName: z.string().optional(),
  scorecardBase64: z.string().optional(),
});

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    examTrack: user.examTrack,
    targetYear: user.targetYear,
    journey: user.journey,
    exam: user.exam,
    scoreType: user.scoreType,
    score: user.score,
    category: user.category,
    homeState: user.homeState,
    preferredBranches: user.preferredBranches,
    stream: user.stream,
    budget: user.budget,
    targetExam: user.targetExam,
    scorecardName: user.scorecardName,
  };
}

function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// REGISTER
router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const existingUser = await User.findOne({ email: input.email });

    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({ ...input, passwordHash });
    const token = signToken(user._id);

    setTokenCookie(res, token);

    return res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

// LOGIN
router.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user._id);
    setTokenCookie(res, token);

    return res.json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  return res.json({ message: 'Logged out successfully' });
});

// GET PROFILE
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: serializeUser(req.user) });
});

// UPDATE PROFILE
router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    let ocrExtracted = null;

    if (input.scorecardBase64) {
      console.log('Detected scorecard upload. Running OCR...');
      const text = await parseScorecardText(input.scorecardBase64);
      const extracted = extractScoreDetails(text);
      if (extracted) {
        input.score = extracted.score;
        input.scoreType = extracted.scoreType;
        ocrExtracted = extracted;
        console.log(`OCR Auto-Fill Applied: ${extracted.score} (${extracted.scoreType})`);
      } else {
        console.log('OCR completed, but no relevant scores/ranks could be matched.');
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: input },
      { new: true },
    ).select('-passwordHash');

    return res.json({ user: serializeUser(user), ocrExtracted });
  } catch (error) {
    return next(error);
  }
});

// DELETE ACCOUNT — NEW
router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user._id;

    // User ka saara data delete karo
    await Promise.all([
      Shortlist.deleteMany({ user: userId }),
      Decision.deleteMany({ user: userId }),
      Reflection.deleteMany({ user: userId }),
      ActivityLog.deleteMany({ user: userId }),
      User.findByIdAndDelete(userId),
    ]);

    // Cookie clear karo
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    return res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    return next(error);
  }
});

export default router;
