import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';

/**
 * Parses text from a scorecard image (from base64, url, or local path) using Tesseract OCR.
 * @param {string} source - base64 string, http/https URL, or local filepath
 * @returns {Promise<string|null>} Extracted text
 */
export async function parseScorecardText(source) {
  try {
    if (!source) return null;

    let imageSource = null;

    if (source.startsWith('data:')) {
      const matches = source.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        console.warn('OCR skipped: Invalid base64 format');
        return null;
      }
      const base64Content = matches[2];
      imageSource = Buffer.from(base64Content, 'base64');
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      if (source.includes('/uploads/')) {
        const filename = source.split('/uploads/')[1];
        const filePath = path.join(process.cwd(), 'public/uploads', filename);
        if (fs.existsSync(filePath)) {
          imageSource = fs.readFileSync(filePath);
        }
      }
      
      if (!imageSource) {
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        imageSource = Buffer.from(arrayBuffer);
      }
    } else {
      if (fs.existsSync(source)) {
        imageSource = fs.readFileSync(source);
      } else {
        console.warn(`OCR skipped: Local file not found at '${source}'`);
        return null;
      }
    }

    if (!imageSource) {
      console.warn('OCR skipped: No readable image source resolved.');
      return null;
    }

    console.log('Starting OCR text extraction...');
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imageSource);
    await worker.terminate();
    console.log('OCR text extracted.');
    
    return text;
  } catch (error) {
    console.error('OCR parsing error:', error);
    return null;
  }
}

export function extractScoreDetails(text) {
  if (!text) return null;
  const textLower = text.toLowerCase();
  console.log('Analyzing OCR text for score details...');

  // 1. Try to find JEE Percentile (e.g. "percentile: 98.45" or "nta score: 99.1")
  const percentileMatch = textLower.match(/(?:percentile(?:\s+score)?|nta\s+score)\s*[:=-]?\s*([0-9]{2,3}(?:\.[0-9]+)?)/);
  if (percentileMatch) {
    const value = parseFloat(percentileMatch[1]);
    if (value >= 0 && value <= 100) {
      console.log(`Extracted Percentile: ${value}`);
      return {
        scoreType: 'Percentile',
        score: value.toString(),
      };
    }
  }

  // 2. Try to find Rank (e.g. "all india rank: 4500" or "air: 12000" or "rank: 8900")
  const rankMatch = textLower.match(/(?:all\s+india\s+rank|air|crl\s+rank|crl|rank)\s*[:=-]?\s*([0-9]{1,7})/);
  if (rankMatch) {
    const value = parseInt(rankMatch[1], 10);
    console.log(`Extracted Rank: ${value}`);
    return {
      scoreType: 'Rank',
      score: value.toString(),
    };
  }

  // 3. Try to find Board % (e.g. "percentage: 92%" or "aggregate: 88%")
  const percentMatch = textLower.match(/(?:percentage|aggregate|marks|pct|total)\s*[:=-]?\s*([0-9]{2}(?:\.[0-9]+)?)\s*%/);
  if (percentMatch) {
    const value = parseFloat(percentMatch[1]);
    if (value >= 30 && value <= 100) {
      console.log(`Extracted Board %: ${value}`);
      return {
        scoreType: 'Board %',
        score: value.toString(),
      };
    }
  }

  return null;
}
