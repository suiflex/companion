import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// Desktop shell: Tauri loads built assets from ../dist. Aliases mirror the
// extension so packaged packages resolve the same way across the monorepo.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: '',
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  resolve: {
    alias: {
      '@meetcc/shared': p('../../packages/shared/src'),
      '@meetcc/ai': p('../../packages/ai/src'),
      '@meetcc/meeting': p('../../packages/meeting/src'),
      '@meetcc/store': p('../../packages/store/src'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
