import { existsSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { env } from '../config/env';
import { WEB_DIST_DIR } from '../config/paths';
import { AppError, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { adminRouter } from './routes/admin';
import { apiRouter } from './routes/api';
import { authRouter } from './routes/auth';

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  const type = (err as { type?: string }).type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Malformed JSON body.' } });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'VALIDATION', message: 'Request body is too large.' } });
    return;
  }
  logger.error({ err, path: req.path }, 'Unhandled request error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
  });
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          connectSrc: ["'self'", 'ws:', 'wss:'],
          upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
        },
      },
      strictTransportSecurity: env.COOKIE_SECURE,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '300kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
  app.use('/api', requireAuth, apiRouter);
  app.use('/api', () => {
    throw notFound('No such API endpoint.');
  });

  // Production: serve the built web app (single port for UI + API + Socket.IO).
  const indexHtml = path.join(WEB_DIST_DIR, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(
      '/assets',
      express.static(path.join(WEB_DIST_DIR, 'assets'), { immutable: true, maxAge: '1y' }),
    );
    app.use(express.static(WEB_DIST_DIR, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
