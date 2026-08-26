import { defineConfig } from 'vite';

// Same reason as packages/mcp: the bin is TypeScript that has to run under
// plain `node`, so it is bundled rather than executed from source.
export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'dist',
    ssr: 'src/bin.ts',
    rollupOptions: {
      external: [/^node:/],
      output: { entryFileNames: 'server.js', banner: '#!/usr/bin/env node' },
    },
  },
});
