import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import * as Sentry from '@sentry/node';
import { logger } from '../src/utils/logger.js';
import './setup.js';

vi.mock('@sentry/node', () => {
  return {
    captureException: vi.fn(),
    init: vi.fn(),
  };
});

describe('Structured Logging and Sentry Integration', () => {
  it('should capture errors in Sentry and log them with Pino on deliberate 500', async () => {
    // Enable Sentry manually for the test duration
    process.env.SENTRY_DSN = 'https://dummy-dsn@sentry.io/1';
    
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const res = await request(app)
      .get('/api/debug-error');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');

    // Verify Sentry captured the exception
    expect(Sentry.captureException).toHaveBeenCalled();
    
    // Verify Pino logged the error with structured metadata
    expect(loggerSpy).toHaveBeenCalled();
    const loggedErrorArgs = loggerSpy.mock.calls[0][0];
    expect(loggedErrorArgs.err).toBeDefined();
    expect(loggedErrorArgs.err.message).toBe('Deliberate 500 server error for Sentry and Pino validation');
    expect(loggedErrorArgs.req).toBeDefined();
    expect(loggedErrorArgs.req.url).toBe('/api/debug-error');

    // Clean up
    loggerSpy.mockRestore();
    delete process.env.SENTRY_DSN;
  });
});
