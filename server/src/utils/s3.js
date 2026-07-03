import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Setup S3 Client if credentials are provided
const s3Configured = !!(
  process.env.AWS_ACCESS_KEY_ID && 
  process.env.AWS_SECRET_ACCESS_KEY && 
  process.env.AWS_S3_BUCKET && 
  process.env.AWS_REGION
);

let s3Client = null;
if (s3Configured) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Uploads a base64-encoded image to S3 (or local filesystem fallback).
 * @param {string} base64Data - Raw data URL (e.g. data:image/png;base64,...)
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} File URL
 */
export async function uploadScorecard(base64Data, originalName) {
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 format');
  }

  const contentType = matches[1];
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, 'base64');
  
  const ext = originalName ? path.extname(originalName) : `.${contentType.split('/')[1] || 'png'}`;
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;

  if (s3Configured && s3Client) {
    const bucketName = process.env.AWS_S3_BUCKET;
    const key = `scorecards/${filename}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    
    return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } else {
    // Local fallback: write to public/uploads
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);
    
    const port = process.env.PORT || 5000;
    return `http://localhost:${port}/uploads/${filename}`;
  }
}
