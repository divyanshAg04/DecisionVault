import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// AI routes ke liye dedicated rate limiter
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,              // 5 AI calls per minute per IP
  message: { message: 'AI rate limit exceeded. Please wait a minute before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiInputSchema = z.object({
  text: z.string().min(5, 'Research text must be at least 5 characters long'),
});

const askSchema = z.object({
  question: z.string().min(3, 'Question must be at least 3 characters long'),
});

router.use(requireAuth);
router.use(aiLimiter);

router.post('/summarize', async (req, res, next) => {
  try {
    const { text } = aiInputSchema.parse(req.body);
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Analyze the following college research feedback or web content and extract exactly 3 key pros, 3 key cons, and a recommended confidence level (an integer from 1 to 100 based on resource reliability). You MUST respond in valid JSON format only, matching this schema: { "pros": ["string"], "cons": ["string"], "confidence": 75 }. Do not include markdown code block formatting or backticks around JSON. Here is the research text: \n\n${text}`,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        try {
          const cleanJson = rawText
            .trim()
            .replace(/^```json/, '')
            .replace(/```$/, '')
            .trim();
          const parsed = JSON.parse(cleanJson);
          return res.json({ ...parsed, source: 'gemini' });
        } catch (e) {
          // JSON parse fail hua — fallback pe jayenge
        }
      }
    }

    // Fallback NLP agar Gemini fail ho
    const textLower = text.toLowerCase();
    const pros = [];
    const cons = [];

    if (textLower.includes('placement') || textLower.includes('package') || textLower.includes('lpa')) {
      pros.push('Excellent placement package rates matching industry standards');
    }
    if (textLower.includes('coding') || textLower.includes('developer') || textLower.includes('cp')) {
      pros.push('Highly competitive coding and programming peer culture');
    }
    if (textLower.includes('fee') || textLower.includes('expensive')) {
      cons.push('Higher academic cost compared to other technical universities');
    }
    if (textLower.includes('hostel') || textLower.includes('mess')) {
      cons.push('Mixed reviews regarding hostel facilities and mess food quality');
    }
    if (textLower.includes('campus') || textLower.includes('infrastructure')) {
      if (textLower.includes('small') || textLower.includes('compact')) {
        cons.push('Compact campus layout with limited sports/recreation options');
      } else {
        pros.push('State-of-the-art campus infrastructure and facilities');
      }
    }

    if (pros.length === 0) {
      pros.push(
        'Strong brand value with solid corporate network',
        'Active student technical societies',
        'Good location connectivity',
      );
    }
    if (cons.length === 0) {
      cons.push(
        'Competitive peer environment with high pressure',
        'Strict attendance criteria requirements',
        'Limited branch-wise elective customizability',
      );
    }

    const finalPros = pros.slice(0, 3);
    const finalCons = cons.slice(0, 3);

    let confidence = 65;
    if (textLower.includes('official') || textLower.includes('pdf')) confidence = 85;
    else if (textLower.includes('senior') || textLower.includes('review')) confidence = 75;

    return res.json({ pros: finalPros, cons: finalCons, confidence, source: 'fallback' });
  } catch (error) {
    return next(error);
  }
});

router.post('/ask', async (req, res, next) => {
  try {
    const { question } = askSchema.parse(req.body);
    const user = req.user;
    const apiKey = process.env.GEMINI_API_KEY;

    const profileDescription = `
Candidate Name: ${user.name}
Target Exam: ${user.examTrack} (Details: ${user.exam || 'N/A'})
Score Type: ${user.scoreType || 'Rank'}
Score/Rank: ${user.score || 'N/A'}
Category: ${user.category || 'General'}
Home State: ${user.homeState || 'Not Specified'}
Preferred Branches: ${user.preferredBranches || 'N/A'}
Onboarding Status: ${user.journey || 'N/A'}
    `.trim();

    if (apiKey) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are DecisionVault's College Selection AI counselor. Use the following student profile details to answer the student's question objectively and concisely. Keep the response under 150 words. Do not use markdown headers, just plain formatting.\n\nStudent Profile:\n${profileDescription}\n\nStudent Question:\n"${question}"`,
                  },
                ],
              },
            ],
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawText =
          data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
        return res.json({ answer: rawText.trim(), source: 'gemini' });
      } else {
        const errData = await response.json().catch(() => ({}));
        console.error('Gemini API call failed in /ask:', errData);
      }
    }

    // Fallback agar API key missing ho ya fail ho
    const mockAnswers = [
      `Based on your target exam ${user.examTrack} and rank/score ${user.score || 'N/A'}, you have a solid chance at top State Technical Universities. Your preference for ${user.preferredBranches || 'CS'} aligns well with your stats.`,
      `With a rank of ${user.score || 'N/A'} in category ${user.category || 'General'}, prioritize branches carefully. For Computer Science, IIIT Lucknow has historically strong placement stats.`,
      `Since you are in the "${user.journey}" stage, start comparing the ROI of your shortlisted choices. Your preferred branches (${user.preferredBranches || 'CS'}) are highly competitive, so having backup options is key.`,
    ];
    const randomIndex = Math.abs(question.length) % mockAnswers.length;
    return res.json({ answer: mockAnswers[randomIndex], source: 'fallback' });
  } catch (error) {
    return next(error);
  }
});

export default router;
