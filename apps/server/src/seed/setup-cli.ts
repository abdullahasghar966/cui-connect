/**
 * `npm run setup`: deletes ALL data (demo or real) and creates an empty campus with one admin.
 * Interactive by default; for scripts, pass `--yes` with SETUP_ADMIN_NAME, SETUP_ADMIN_EMAIL
 * and SETUP_ADMIN_PASSWORD in the environment.
 */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { resolveMongo } from '../db/resolve';
import { initModels } from '../models';
import { setupFreshCampus } from './setup';

// Readline echoes typing through this stream, so muting it hides passwords.
let muted = false;
const output = Object.assign(
  new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  }),
  { columns: process.stdout.columns, isTTY: process.stdout.isTTY },
);
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });

async function ask(question: string, fallback = ''): Promise<string> {
  const hint = fallback ? ` (${fallback})` : '';
  return (await rl.question(`${question}${hint}: `)).trim() || fallback;
}

/** Reads a line without echoing it: readline's output is muted while the password is typed. */
async function askHidden(question: string): Promise<string> {
  process.stdout.write(`${question}: `);
  muted = true;
  try {
    return await rl.question('');
  } finally {
    muted = false;
    process.stdout.write('\n');
  }
}

async function collectInput() {
  if (process.argv.includes('--yes')) {
    return {
      name: process.env.SETUP_ADMIN_NAME ?? 'IT Services Admin',
      email: process.env.SETUP_ADMIN_EMAIL ?? '',
      password: process.env.SETUP_ADMIN_PASSWORD ?? '',
    };
  }
  console.log(
    '\nThis DELETES every user, group and message, then creates an empty campus with one admin.',
  );
  if ((await ask('Type DELETE to continue')) !== 'DELETE') {
    console.log('Cancelled. Nothing was changed.');
    process.exit(0);
  }
  const name = await ask('Administrator name', 'IT Services Admin');
  const email = await ask('Administrator email');
  for (;;) {
    const password = await askHidden('Password (at least 8 characters)');
    if (password.length < 8) {
      console.log('Too short, try again.');
      continue;
    }
    if ((await askHidden('Repeat the password')) === password) return { name, email, password };
    console.log('The passwords do not match, try again.');
  }
}

const input = await collectInput();
rl.close();

const mongo = await resolveMongo();
try {
  await mongoose.connect(mongo.uri, { dbName: env.MONGO_DB_NAME });
  await initModels();
  const admin = await setupFreshCampus(input);
  console.log(`\nDone. Sign in as ${admin.email} and start in Admin console → Structure.`);
} catch (err) {
  if (err instanceof z.ZodError) console.error(`\nNothing was changed: ${z.prettifyError(err)}`);
  else throw err;
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}
process.exit();
