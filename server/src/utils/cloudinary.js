import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { logger } from './logger.js';

// Setup Cloudinary Client if credentials are provided
export const cloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET
);

if (!cloudinaryConfigured) {
  logger.warn('Cloudinary not configured — uploads will use ephemeral local storage and WILL BE LOST on redeploy. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to enable persistent storage.');
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Uploads a base64-encoded image to Cloudinary (or local filesystem fallback).
 * @param {string} base64Data - Raw data URL (e.g. data:image/png;base64,...)
 * @param {string} originalName - Original filename
 * @returns {Promise<string>} File URL
 */
export async function uploadScorecard(base64Data, originalName) {
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 format');
  }

  const contentType = matches[1];
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, 'base64');
  
  const ext = originalName ? path.extname(originalName) : `.${contentType.split('/')[1] || 'png'}`;
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;

  if (cloudinaryConfigured) {
    // Cloudinary supports direct upload of base64 data URLs
    const result = await cloudinary.uploader.upload(base64Data, {
      folder: 'scorecards',
      public_id: path.parse(filename).name,
      resource_type: 'auto',
    });
    return result.secure_url;
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
