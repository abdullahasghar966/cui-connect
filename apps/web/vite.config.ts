import { existsSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Share API_PORT with the server through the repo-root .env.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const api = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development: the session cookie and WebSocket go through the proxy.
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
  },
});
