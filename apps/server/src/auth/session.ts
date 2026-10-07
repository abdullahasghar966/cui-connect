import { SESSION_COOKIE } from '@cui/shared';
import { parseCookie } from 'cookie';
import type { CookieOptions } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { durationToMs, env } from '../config/env';
import { User, type UserDoc } from '../models';

const key = new TextEncoder().encode(env.JWT_SECRET);

export type AuthUser = UserDoc;

export function signSession(user: Pick<UserDoc, '_id' | 'tokenVersion'>): Promise<string> {
  return new SignJWT({ tv: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user._id))
    .setIssuedAt()
    .setExpirationTime(env.JWT_TTL)
    .sign(key);
}

async function verifySession(token: string): Promise<{ userId: string; tv: number } | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { userId: payload.sub, tv: Number(payload.tv ?? 0) };
  } catch {
    return null;
  }
}

/**
 * Resolves a session token to an active user. Tokens are rejected once the account is
 * deactivated or its tokenVersion is bumped, so revocation takes effect immediately.
 */
export async function authenticateToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await verifySession(token);
  if (!session || !/^[a-f\d]{24}$/i.test(session.userId)) return null;
  const user = await User.findById(session.userId).lean<UserDoc>();
  if (!user?.active || user.tokenVersion !== session.tv) return null;
  return user;
}

export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  return parseCookie(cookieHeader)[SESSION_COOKIE];
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: durationToMs(env.JWT_TTL),
  };
}
