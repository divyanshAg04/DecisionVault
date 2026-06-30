import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Cutoff } from '../models/Cutoff.js';
import { predictPlacementAndPackage } from '../utils/mlPredictor.js';

const router = express.Router();

router.use(requireAuth);

const admissionSchema = z.object({
  rank: z.coerce.number().int().positive(),
  category: z.string().optional(),
  seatType: z.string().default('OPEN'),
  gender: z.string().default('Gender-Neutral'),
  quota: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(250),
});

const placementSchema = z.object({
  gender: z.string().default('Male'),
  age: z.coerce.number().int().min(16).max(40).default(21),
  degree: z.string().default('BTech'),
  branch: z.string().default('CS'),
  cgpa: z.coerce.number().min(0).max(10).default(7.5),
  backlogs: z.coerce.number().int().min(0).max(30).default(0),
  internships: z.coerce.number().int().min(0).max(20).default(0),
  certifications: z.coerce.number().int().min(0).max(50).default(0),
  codingSkills: z.coerce.number().int().min(1).max(10).default(5),
  communicationSkills: z.coerce.number().int().min(1).max(10).default(5),
  aptitudeScore: z.coerce.number().int().min(1).max(100).default(70),
  projects: z.coerce.number().int().min(0).max(50).default(0),
});

// 1. Predict JEE admission probability across all institutes/programs
router.post('/predict-admission', async (req, res, next) => {
  try {
    const { rank, seatType, gender, quota, limit } = admissionSchema.parse(req.body);
    const studentRank = rank;
    const filter = {};

    // Match Seat Type (OPEN, OBC-NCL, SC, ST, EWS, etc.)
    if (seatType && seatType !== 'All') {
      filter.seatType = seatType;
    } else {
      filter.seatType = 'OPEN'; // Default to Open Category if not specified
    }

    // Match Gender
    if (gender && gender !== 'All') {
      filter.gender = gender;
    } else {
      filter.gender = 'Gender-Neutral'; // Default to Gender-Neutral
    }

    // Match Quota (AI = All India, HS = Home State, OS = Other State)
    if (quota && quota !== 'All') {
      filter.quota = quota;
    }

    // Find cutoffs in database
    const cutoffs = await Cutoff.find(filter).lean();

    if (cutoffs.length === 0) {
      return res.json({
        studentRank,
        totalMatchesCount: 0,
        predictions: [],
        message: 'No cutoff rows matched this filter. Run npm --prefix server run seed:cutoffs after configuring MongoDB.',
      });
    }
    
    // Compute probability for each choice
    const predictions = cutoffs.map((row) => {
      let probability = 0.0;
      
      if (studentRank <= row.closingRank) {
        // Ranks lower than the closing rank have high probability (up to 1.0)
        // If close to opening rank, probability is absolute
        const diffRatio = (row.closingRank - studentRank) / row.closingRank;
        probability = 0.85 + Math.min(0.15, diffRatio);
      } else {
        // Beyond closing rank: exponential decay
        const diff = studentRank - row.closingRank;
        probability = Math.exp(-diff / (row.closingRank * 0.15));
      }

      // Convert to clean percentage
      const probabilityPercent = Math.round(probability * 1000) / 10;

      return {
        institute: row.institute,
        program: row.program,
        quota: row.quota,
        seatType: row.seatType,
        gender: row.gender,
        openingRank: row.openingRank,
        closingRank: row.closingRank,
        probability: Math.max(0.1, Math.min(100.0, probabilityPercent))
      };
    });

    // Sort by highest probability and return a bounded result set for discovery.
    predictions.sort((a, b) => b.probability - a.probability);
    
    return res.json({
      studentRank,
      totalMatchesCount: predictions.length,
      predictions: predictions.slice(0, limit)
    });
  } catch (err) {
    next(err);
  }
});

// 2. Predict placement probability and expected salary package via ML models
router.post('/predict-placement', (req, res, next) => {
  try {
    const input = placementSchema.parse(req.body);

    const result = predictPlacementAndPackage({
      gender: input.gender,
      age: input.age,
      degree: input.degree,
      branch: input.branch,
      cgpa: input.cgpa,
      backlogs: input.backlogs,
      internships: input.internships,
      certifications: input.certifications,
      codingSkills: input.codingSkills,
      communicationSkills: input.communicationSkills,
      aptitudeScore: input.aptitudeScore,
      projects: input.projects,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
