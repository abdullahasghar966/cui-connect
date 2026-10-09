import { createHash, timingSafeEqual } from 'node:crypto';
import { changePasswordSchema, firstAdminSchema, loginSchema, SESSION_COOKIE } from '@cui/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { currentUser, requireAuth } from '../../auth/middleware';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../auth/password';
import { sessionCookieOptions, signSession } from '../../auth/session';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, notFound, parse, unauthorized } from '../../lib/errors';
import { User, type UserDoc } from '../../models';
import { revokeUserSessions } from '../../realtime/notifier';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../seed/data';
import { createFirstAdmin, isDemoCampus, needsFirstAdmin } from '../../seed/setup';
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

  res.cookie(SESSION_COOKIE, await signSession(user), sessionCookieOptions(req.secure));
  res.json({ user: toUserDTO(user, await getOrgLookup()) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: toUserDTO(currentUser(req), await getOrgLookup()) });
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, keepSocketId } = parse(changePasswordSchema, req.body);
  const user = await User.findById(currentUser(req)._id).select('+passwordHash').lean<UserDoc>();
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw badRequest('Your current password is incorrect.');
  }
  // Bumping tokenVersion signs out every other session; this browser gets a fresh cookie.
  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  ).lean<UserDoc>();
  if (!updated) throw unauthorized();
  revokeUserSessions(
    String(user._id),
    'Your password was changed. Please sign in again.',
    keepSocketId,
  );
  void recordAudit({
    action: 'user.password_changed',
    actor: user,
    summary: `${user.name} changed their password`,
    targetType: 'user',
    targetId: user._id,
  });
  res.cookie(SESSION_COOKIE, await signSession(updated), sessionCookieOptions(req.secure));
  res.json({ ok: true });
});

/** First-run setup: whether the setup page should be shown, and whether it needs the code. */
authRouter.get('/setup', async (_req, res) => {
  res.json({ needed: await needsFirstAdmin(), codeRequired: !!env.SETUP_CODE });
});

const sameSecret = (given: string, expected: string) => {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
};

let settingUp = false;

/** Creates the first admin from the browser. Works only while the database has no users. */
authRouter.post('/setup', loginLimiter, async (req, res) => {
  const { setupCode, ...admin } = parse(firstAdminSchema, req.body);
  if (env.SETUP_CODE && !sameSecret(setupCode ?? '', env.SETUP_CODE)) {
    throw forbidden('The setup code is incorrect. It is the SETUP_CODE set on the server.');
  }
  const alreadySetUp = () => conflict('CUI Connect is already set up. Sign in instead.');
  // The flag is taken before the first await, so two simultaneous requests can't both pass.
  if (settingUp) throw alreadySetUp();
  settingUp = true;
  try {
    if (!(await needsFirstAdmin())) throw alreadySetUp();
    const user = await createFirstAdmin(admin);
    res.cookie(SESSION_COOKIE, await signSession(user), sessionCookieOptions(req.secure));
    res.status(201).json({ user: toUserDTO(user, await getOrgLookup()) });
  } finally {
    settingUp = false;
  }
});

/**
 * Demo accounts for the login screen. Hidden with DEMO_MODE=false, and after `npm run setup`
 * replaced the demo campus with a real one (those accounts no longer exist).
 */
authRouter.get('/demo-accounts', async (_req, res) => {
  if (!env.DEMO_MODE || !(await isDemoCampus())) throw notFound();
  res.json({ password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS });
});
