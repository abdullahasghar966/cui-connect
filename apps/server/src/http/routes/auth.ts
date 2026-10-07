import { loginSchema, SESSION_COOKIE } from '@cui/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { currentUser, requireAuth } from '../../auth/middleware';
import { burnPasswordCheck, verifyPassword } from '../../auth/password';
import { sessionCookieOptions, signSession } from '../../auth/session';
import { env } from '../../config/env';
import { forbidden, notFound, parse, unauthorized } from '../../lib/errors';
import { User, type UserDoc } from '../../models';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../seed/data';
import { recordAudit } from '../../services/audit';
import { getOrgLookup, toUserDTO } from '../../services/mappers';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.LOGIN_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in a minute.' },
    });
  },
});

const BAD_CREDENTIALS = 'Incorrect email/registration number or password.';

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password } = parse(loginSchema, req.body);
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase() }
    : { regNo: identifier.toUpperCase() };
  const user = await User.findOne(query).select('+passwordHash').lean<UserDoc>();
  if (!user) {
    await burnPasswordCheck(password);
    throw unauthorized(BAD_CREDENTIALS);
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    void recordAudit({
      action: 'auth.failed',
      severity: 'warning',
      actor: user,
      summary: `Failed sign-in attempt for ${user.name}`,
      targetType: 'user',
      targetId: user._id,
    });
    throw unauthorized(BAD_CREDENTIALS);
  }
  if (!user.active)
    throw forbidden('This account has been deactivated. Please contact IT Services.');

  res.cookie(SESSION_COOKIE, await signSession(user), sessionCookieOptions());
  res.json({ user: toUserDTO(user, await getOrgLookup()) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: toUserDTO(currentUser(req), await getOrgLookup()) });
});

/** Demo accounts for the login screen (disable with DEMO_MODE=false). */
authRouter.get('/demo-accounts', (_req, res) => {
  if (!env.DEMO_MODE) throw notFound();
  res.json({ password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS });
});
