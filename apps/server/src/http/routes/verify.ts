/**
 * Public ID card check: no sign-in, so a guard or an employer can scan a card with any phone.
 * Codes are random (2^144 possibilities), and checks are rate-limited per address anyway.
 */
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { checkIdCard, idCardPhoto } from '../../services/idcard';

export const verifyRouter = Router();

verifyRouter.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many checks. Try again in a minute.' },
      });
    },
  }),
  (_req, res, next) => {
    // Always the live answer (a card may have just been replaced), and never in search engines.
    res.set({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    next();
  },
);

verifyRouter.get('/:code', async (req, res) => {
  res.json(await checkIdCard(String(req.params.code)));
});

verifyRouter.get('/:code/photo', async (req, res, next) => {
  const { file, stream } = await idCardPhoto(String(req.params.code));
  res.set({
    'content-type': file.type,
    'content-length': String(file.size),
    'content-security-policy': "default-src 'none'; sandbox",
  });
  stream.on('error', next).pipe(res);
});
