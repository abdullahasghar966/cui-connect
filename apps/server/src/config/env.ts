import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR, REPO_ROOT } from './paths';

const envFile = path.join(REPO_ROOT, '.env');
// Values already present in the real environment take precedence over the file.
if (existsSync(envFile)) process.loadEnvFile(envFile);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().int().min(0).max(65_535).default(4000),
  MONGODB_URI: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  MONGO_DB_NAME: z.string().trim().min(1).default('cui_connect'),
  EMBEDDED_MONGO_PORT: z.coerce.number().int().min(1).max(65_535).default(27019),
  /** Folder (relative to the repo root) where the embedded MongoDB keeps its data. */
  EMBEDDED_MONGO_DIR: z.string().trim().min(1).default('.data/mongo'),
  JWT_SECRET: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  JWT_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use a duration like 30m, 12h or 7d')
    .default('12h'),
  COOKIE_SECURE: z.stringbool().default(false),
  AUTO_SEED: z.stringbool().default(true),
  DEMO_MODE: z.stringbool().default(true),
  SEED_ON_START: z.enum(['reset', 'none']).default('none'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  MESSAGE_BURST: z.coerce.number().int().min(1).default(8),
  MESSAGE_RATE_PER_SEC: z.coerce.number().min(0.1).default(2),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:\n', z.prettifyError(parsed.error));
  process.exit(1);
}

/**
 * Without JWT_SECRET we generate a random secret once and keep it in .data/, so sessions
 * survive restarts without anyone having to configure (or commit) a secret.
 */
function resolveJwtSecret(configured: string | undefined): string {
  if (configured) {
    if (configured.length < 32) {
      console.error('JWT_SECRET must be at least 32 characters long.');
      process.exit(1);
    }
    return configured;
  }
  const file = path.join(DATA_DIR, 'jwt-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(DATA_DIR, { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const env = {
  ...parsed.data,
  JWT_SECRET: resolveJwtSecret(parsed.data.JWT_SECRET),
};

export type Env = typeof env;

/** Converts a duration like `12h` into milliseconds. */
export function durationToMs(value: string): number {
  const amount = Number.parseInt(value, 10);
  const unit = value.at(-1);
  const factor = unit === 's' ? 1e3 : unit === 'm' ? 6e4 : unit === 'h' ? 3.6e6 : 8.64e7;
  return amount * factor;
}
