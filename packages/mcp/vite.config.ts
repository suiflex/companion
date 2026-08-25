import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// The server is TypeScript that runs under plain `node`, and the workspace
// packages it uses are published as raw `src/*.ts` for the bundler — Node
// cannot resolve either. So the bin is built, not run from source: the
// workspace code is bundled in, and only the real npm packages stay external.
export default defineConfig({
  resolve: {
    alias: {
      '@meetcc/shared': p('../shared/src'),
      '@meetcc/store': p('../store/src'),
    },
  },
  build: {
    target: 'node22',
    outDir: 'dist',
    ssr: 'src/server.ts',
    rollupOptions: {
      external: [/^@modelcontextprotocol\//, '@sqlite.org/sqlite-wasm', /^node:/],
      output: {
        entryFileNames: 'server.js',
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
