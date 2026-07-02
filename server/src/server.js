import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { ZodError } from 'zod';
import { connectDb } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import collegeRoutes from './routes/collegeRoutes.js';
import decisionRoutes from './routes/decisionRoutes.js';
import shortlistRoutes from './routes/shortlistRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import mlRoutes from './routes/mlRoutes.js';
import { trainModels } from './utils/mlPredictor.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 10000, // Loose limit in development
  message: { message: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(cookieParser());

const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
if (process.env.CLIENT_ORIGIN) {
  allowedOrigins.push(
    ...process.env.CLIENT_ORIGIN.split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) ||
        /^http:\/\/localhost(:\d+)?$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        /^http:\/\/172\.16\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api', limiter);

app.get('/api/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  return res.json({
    status: dbState === 1 ? 'ok' : 'degraded',
    service: 'DecisionVault API',
    database: states[dbState] || 'unknown',
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/colleges', collegeRoutes);
app.use('/api/shortlists', shortlistRoutes);
app.use('/api/decisions', decisionRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ml', mlRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((error, req, res, next) => {
  if (error instanceof ZodError) {
    const message = error.issues
      .map(issue => `${issue.path.join('.') ? issue.path.join('.') + ': ' : ''}${issue.message}`)
      .join('; ');
    return res.status(400).json({
      message: message || 'Validation failed',
      issues: error.issues,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({ message: 'Duplicate record' });
  }

  console.error(error);
  return res.status(500).json({ message: 'Internal server error' });
});

connectDb(process.env.MONGO_URI)
  .then(() => {
    try {
      trainModels();
    } catch (err) {
      console.error('Failed to train ML models on startup:', err);
    }
    app.listen(port, () => {
      console.log(`DecisionVault API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Database connection failed');
    console.error(error);
    process.exit(1);
  });
