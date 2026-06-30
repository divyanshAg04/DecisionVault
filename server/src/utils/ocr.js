import { createWorker } from 'tesseract.js';

export async function parseScorecardText(base64Data) {
  try {
    if (!base64Data) return null;

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      console.warn('OCR skipped: Invalid base64 format');
      return null;
    }

    const contentType = matches[1];
    const base64Content = matches[2];

    if (!contentType.startsWith('image/')) {
      console.warn(`OCR skipped: Content-Type '${contentType}' is not an image.`);
      return null;
    }

    const buffer = Buffer.from(base64Content, 'base64');
    
    console.log('Starting OCR text extraction...');
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(buffer);
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
