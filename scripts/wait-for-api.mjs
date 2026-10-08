// Used by `npm run dev`: start the web dev server only once the API answers, so the Vite
// proxy never forwards requests to a server that is still starting up.
import { existsSync } from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(import.meta.dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = `http://localhost:${process.env.API_PORT ?? 4000}/api/health`;
const deadline = Date.now() + 10 * 60_000;
let announced = false;

while (Date.now() < deadline) {
  try {
    const res = await fetch(url);
    if (res.ok) process.exit(0);
  } catch {
    // not up yet
  }
  if (!announced) {
    console.log(`Waiting for the API at ${url} …`);
    announced = true;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error(`The API did not start within 10 minutes (${url}).`);
process.exit(1);
