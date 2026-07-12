import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import { logger } from './utils/logger.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './utils/swagger.js';
import authRoutes from './routes/authRoutes.js';
import collegeRoutes from './routes/collegeRoutes.js';
import decisionRoutes from './routes/decisionRoutes.js';
import shortlistRoutes from './routes/shortlistRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import mlRoutes from './routes/mlRoutes.js';
import { s3Configured } from './utils/s3.js';

dotenv.config();

// Initialize Sentry error tracking
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
  });
  logger.info('Sentry initialized successfully.');
}

const app = express();

app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 10000, // Loose limit in development
  message: { message: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));


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
      
      // Tighten CORS configuration for production (Improvement #5)
      if (process.env.NODE_ENV === 'production') {
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
        return;
      }

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

// CSRF double-submit-cookie validation middleware
const CSRF_EXEMPT_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.use('/api', (req, res, next) => {
  if (!CSRF_METHODS.has(req.method)) return next();

  const fullPath = req.baseUrl + req.path;
  if (CSRF_EXEMPT_PATHS.some(exempt => fullPath === exempt)) return next();

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF token missing or invalid' });
  }

  return next();
});

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
    storage: s3Configured ? 's3' : 'local-ephemeral',
  });
});

// API documentation — served at /api/docs (Improvement #17)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use('/api/auth', authRoutes);
app.use('/api/colleges', collegeRoutes);
app.use('/api/shortlists', shortlistRoutes);
app.use('/api/decisions', decisionRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ml', mlRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug-error', (req, res) => {
    throw new Error('Deliberate 500 server error for Sentry and Pino validation');
  });
}

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

  // Report unhandled rejections and 500 errors to Sentry
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }

  // Pino structured logging (Improvement #12)
  logger.error({ 
    err: {
      message: error.message,
      stack: error.stack,
      code: error.code
    },
    req: {
      method: req.method,
      url: req.url,
      headers: req.headers,
    }
  }, 'Internal server error occurred');

  return res.status(500).json({ message: 'Internal server error' });
});

export default app;
