import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// base '' -> relative asset URLs, required inside chrome-extension:// pages
export default defineConfig({
  plugins: [react()],
  base: '',
  resolve: {
    alias: {
      '@meetcc/shared/i18n': p('../../packages/shared/src/i18n'),
      '@meetcc/shared': p('../../packages/shared/src'),
      '@meetcc/ai': p('../../packages/ai/src'),
      '@meetcc/meeting': p('../../packages/meeting/src'),
      '@meetcc/store': p('../../packages/store/src'),
      '@meetcc/exporters': p('../../packages/exporters/src'),
    },
  },
  build: {
    // Chromium-only runtime (MV3 extension) — allows top-level await
    target: 'chrome110',
    outDir: 'dist',
    rollupOptions: {
      input: {
        app: p('./index.html'),
        background: p('./src/background.ts'),
      },
      output: {
        // service worker must be a stable filename at the bundle root
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
