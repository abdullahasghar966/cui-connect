import { hash, verify } from '@node-rs/argon2';

// Argon2id with the OWASP-recommended baseline (19 MiB memory, 2 iterations, 1 lane).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Verifies against a throwaway hash so unknown accounts take as long as wrong passwords. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('cui-connect-timing-equaliser');
  await verifyPassword(await dummyHash, password);
}
