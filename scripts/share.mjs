// `npm run share`: runs the production build and opens a free Cloudflare quick tunnel, so people
// anywhere can use this laptop's CUI Connect over https://. Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const port = Number(process.env.API_PORT ?? 4000);

const serverEntry = path.join(root, 'apps/server/dist/index.mjs');
if (!existsSync(serverEntry) || !existsSync(path.join(root, 'apps/web/dist/index.html'))) {
  console.error('No production build found. Run `npm run build` first.');
  process.exit(1);
}

function findCloudflared() {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] ?? '', 'cloudflared', 'cloudflared.exe'),
    path.join(process.env.ProgramFiles ?? '', 'cloudflared', 'cloudflared.exe'),
  ];
  return candidates.find((file) => existsSync(file)) ?? 'cloudflared';
}

const children = [];
function stop(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

const server = spawn(process.execPath, [serverEntry], {
  cwd: path.join(root, 'apps/server'),
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
});
children.push(server);
server.on('exit', (code) => {
  console.error(`The server stopped (exit code ${code}).`);
  stop(code ?? 1);
});

const health = `http://localhost:${port}/api/health`;
for (let ready = false; !ready; ) {
  ready = await fetch(health).then(
    (res) => res.ok,
    () => false,
  );
  if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
}

console.log('Server is up. Opening the Cloudflare tunnel...');
const tunnel = spawn(
  findCloudflared(),
  ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
children.push(tunnel);
tunnel.on('error', () => {
  console.error(
    'cloudflared was not found. Install it with: winget install --id Cloudflare.cloudflared',
  );
  stop(1);
});
tunnel.on('exit', (code) => {
  console.error(`The tunnel stopped (exit code ${code}).`);
  stop(code ?? 1);
});

let announced = false;
const onOutput = (chunk) => {
  const url = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!url || announced) return;
  announced = true;
  const line = '='.repeat(url.length + 8);
  console.log(`\n${line}\n    ${url}\n${line}`);
  console.log('Share this link. It works while this window stays open and the laptop is online.');
  console.log('A new link is created every time you run `npm run share`. Press Ctrl+C to stop.\n');
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);
