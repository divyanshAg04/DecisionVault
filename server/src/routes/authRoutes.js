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
import { uploadScorecard } from '../utils/cloudinary.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { RefreshToken } from '../models/RefreshToken.js';
import { sendVerificationEmail } from '../utils/mailer.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

function writeOtpDebug(email, otp) {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const filePath = path.join(process.cwd(), 'otp_debug.txt');
    fs.writeFileSync(filePath, `Email: ${email}\nOTP Code: ${otp}\nGenerated At: ${new Date().toLocaleTimeString()}\n`);
    console.log(`[OTP Debug] Wrote OTP to ${filePath}`);
  } catch (err) {
    console.error('[OTP Debug] Failed to write otp_debug.txt:', err.message);
  }
}

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
  preferredStates: z.string().optional(),
  stream: z.string().optional(),
  budget: z.string().optional(),
  targetExam: z.string().optional(),
  scorecardName: z.string().optional(),
  scorecardBase64: z.string().optional(),
});

const COOKIE_OPTS = (req) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  ...(req?.hostname !== 'localhost' ? { domain: req?.hostname } : {}),
});

const CSRF_COOKIE_OPTS = (req) => ({
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  ...(req?.hostname !== 'localhost' ? { domain: req?.hostname } : {}),
});

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setCsrfCookie(res, req) {
  const csrfToken = generateCsrfToken();
  res.cookie('csrfToken', csrfToken, { ...CSRF_COOKIE_OPTS(req), maxAge: 30 * 24 * 60 * 60 * 1000 });
  return csrfToken;
}

function signToken(userId) {
  // Short-lived access token (15 min)
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await RefreshToken.create({ token: raw, user: userId, expiresAt });
  return raw;
}

// POST /refresh — Refresh Token Rotation
router.post('/refresh', async (req, res, next) => {
  try {
    const incomingToken = req.cookies?.refreshToken;
    if (!incomingToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    const stored = await RefreshToken.findOne({ token: incomingToken });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      // Possible token reuse — revoke all tokens for this user
      if (stored) {
        await RefreshToken.updateMany({ user: stored.user }, { revoked: true });
      }
      return res.status(401).json({ message: 'Refresh token invalid or expired. Please log in again.' });
    }

    // Rotate: revoke old token and issue a fresh pair
    const newRefreshToken = await issueRefreshToken(stored.user);
    stored.revoked = true;
    stored.replacedByToken = newRefreshToken;
    await stored.save();

    const accessToken = signToken(stored.user);

    res.cookie('token', accessToken, { ...COOKIE_OPTS(req), maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', newRefreshToken, { ...COOKIE_OPTS(req), maxAge: 30 * 24 * 60 * 60 * 1000 });
    const csrfToken = setCsrfCookie(res, req);

    return res.json({ message: 'Token refreshed successfully', csrfToken });
  } catch (error) {
    return next(error);
  }
});

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
    preferredStates: user.preferredStates || '',
    stream: user.stream,
    budget: user.budget,
    targetExam: user.targetExam,
    scorecardName: user.scorecardName,
    scorecardUrl: user.scorecardUrl || '',
    emailVerified: user.emailVerified || false,
  };
}

function setTokenCookie(res, req, token) {
  res.cookie('token', token, { ...COOKIE_OPTS(req), maxAge: 15 * 60 * 1000 });
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
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const user = await User.create({
      ...input,
      passwordHash,
      emailVerificationToken: otpCode,
      emailVerificationExpires: new Date(Date.now() + 15 * 60 * 1000),
    });
    const token = signToken(user._id);
    const refreshToken = await issueRefreshToken(user._id);

    setTokenCookie(res, req, token);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS(req), maxAge: 30 * 24 * 60 * 60 * 1000 });
    const csrfToken = setCsrfCookie(res, req);

    // Send verification email (non-blocking)
    console.log(`[OTP] Verification code for ${user.email}: ${otpCode}`);
    writeOtpDebug(user.email, otpCode);
    sendVerificationEmail(user.email, otpCode).catch((err) =>
      console.error('[Mailer] Failed to send verification email:', err.message)
    );

    return res.status(201).json({
      token,
      user: serializeUser(user),
      csrfToken,
    });
  } catch (error) {
    return next(error);
  }
});

// GET & POST /verify-email
router.all('/verify-email', async (req, res, next) => {
  try {
    const otp = req.body?.otp || req.query?.token || req.query?.otp;
    if (!otp) {
      return res.status(400).json({ message: 'Verification OTP code is required' });
    }

    let decodedUserId;
    try {
      const authCookie = req.cookies?.token;
      if (authCookie) {
        const decoded = jwt.verify(authCookie, process.env.JWT_SECRET);
        decodedUserId = decoded.userId;
      }
    } catch (err) {
      // Ignore token decoding failure, fallback to matching OTP globally
    }

    let user;
    if (decodedUserId) {
      user = await User.findOne({
        _id: decodedUserId,
        emailVerificationToken: otp.toString().trim(),
        emailVerificationExpires: { $gt: new Date() },
      });
    }

    if (!user) {
      user = await User.findOne({
        emailVerificationToken: otp.toString().trim(),
        emailVerificationExpires: { $gt: new Date() },
      });
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP code' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    return res.json({ message: 'Email verified successfully', user: serializeUser(user) });
  } catch (error) {
    return next(error);
  }
});

// POST /resend-verification
router.post('/resend-verification', requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationToken = otpCode;
    user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    console.log(`[OTP] Resent verification code for ${user.email}: ${otpCode}`);
    writeOtpDebug(user.email, otpCode);
    await sendVerificationEmail(user.email, otpCode);

    return res.json({ message: 'Verification OTP code resent' });
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
      return res.status(401).json({ message: 'mail not exist' });
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user._id);
    const refreshToken = await issueRefreshToken(user._id);

    setTokenCookie(res, req, token);
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS(req), maxAge: 30 * 24 * 60 * 60 * 1000 });
    const csrfToken = setCsrfCookie(res, req);

    // If user is unverified, generate and send a fresh OTP so they can verify immediately
    if (!user.emailVerified) {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      user.emailVerificationToken = otpCode;
      user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      console.log(`[OTP] Login verification code for ${user.email}: ${otpCode}`);
      writeOtpDebug(user.email, otpCode);
      sendVerificationEmail(user.email, otpCode).catch((err) =>
        console.error('[Mailer] Failed to send verification email:', err.message)
      );
    }

    return res.json({
      token,
      user: serializeUser(user),
      csrfToken,
    });
  } catch (error) {
    return next(error);
  }
});

// LOGOUT
router.post('/logout', async (req, res, next) => {
  try {
    const incomingRefresh = req.cookies?.refreshToken;
    if (incomingRefresh) {
      await RefreshToken.findOneAndUpdate({ token: incomingRefresh }, { revoked: true });
    }
    res.clearCookie('token', COOKIE_OPTS(req));
    res.clearCookie('refreshToken', COOKIE_OPTS(req));
    res.clearCookie('csrfToken', CSRF_COOKIE_OPTS(req));
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    return next(error);
  }
});

// GET PROFILE
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: serializeUser(req.user), csrfToken: req.cookies?.csrfToken });
});

// UPDATE PROFILE
router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    let ocrExtracted = null;
    let scorecardUrl = null;

    if (input.scorecardBase64) {
      console.log('Detected scorecard upload. Running OCR and storage upload...');
      scorecardUrl = await uploadScorecard(input.scorecardBase64, input.scorecardName);
      
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

    const updateData = { ...input };
    if (scorecardUrl) {
      updateData.scorecardUrl = scorecardUrl;
    }
    delete updateData.scorecardBase64;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true },
    ).select('-passwordHash');

    return res.json({ user: serializeUser(user), ocrExtracted });
  } catch (error) {
    return next(error);
  }
});

// DELETE ACCOUNT — NEW
router.delete('/account', requireAuth, async (req, res, next) => {
  let session = null;
  try {
    const userId = req.user._id;

    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await Shortlist.deleteMany({ user: userId }).session(session);
        await Decision.deleteMany({ user: userId }).session(session);
        await Reflection.deleteMany({ user: userId }).session(session);
        await ActivityLog.deleteMany({ user: userId }).session(session);
        await User.findByIdAndDelete(userId).session(session);
      });
    } catch (txError) {
      // Fallback if transaction is not supported by database topology (e.g. standalone server)
      const isUnsupported = txError.message?.includes('Transaction numbers are only allowed') || 
                            txError.codeName === 'IllegalOperation' ||
                            txError.code === 20;
      
      if (isUnsupported) {
        console.warn('[Transaction Fallback] Transactions not supported on this MongoDB deployment. Falling back to non-transactional deletion.');
        await Promise.all([
          Shortlist.deleteMany({ user: userId }),
          Decision.deleteMany({ user: userId }),
          Reflection.deleteMany({ user: userId }),
          ActivityLog.deleteMany({ user: userId }),
          RefreshToken.deleteMany({ user: userId }),
          User.findByIdAndDelete(userId),
        ]);
      } else {
        throw txError;
      }
    }

    // Clear all auth cookies
    res.clearCookie('token', COOKIE_OPTS(req));
    res.clearCookie('refreshToken', COOKIE_OPTS(req));
    res.clearCookie('csrfToken', CSRF_COOKIE_OPTS(req));

    return res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    return next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

export default router;
