import { SESSION_COOKIE } from '@cui/shared';
import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { type AuthUser, authenticateToken } from './session';

const USER = Symbol('user');
type RequestWithUser = Request & { [USER]?: AuthUser };

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await authenticateToken(req.cookies?.[SESSION_COOKIE]);
  if (!user) throw unauthorized();
  (req as RequestWithUser)[USER] = user;
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (currentUser(req).role !== 'admin') {
    throw forbidden('Only IT administrators can access this area.');
  }
  next();
}

/** The authenticated user; only valid behind {@link requireAuth}. */
export function currentUser(req: Request): AuthUser {
  const user = (req as RequestWithUser)[USER];
  if (!user) throw unauthorized();
  return user;
}
