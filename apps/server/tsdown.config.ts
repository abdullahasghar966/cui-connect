import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    seed: 'src/seed/cli.ts',
    db: 'src/db/embedded-cli.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  // The shared workspace package ships TypeScript source, so it is bundled in;
  // npm dependencies stay external and load from node_modules.
  deps: { alwaysBundle: [/^@cui\//] },
});
