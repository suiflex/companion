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
  // sqlite-wasm's emscripten glue resolves sqlite3.wasm relative to its own
  // module URL. Pre-bundled into node_modules/.vite/deps, that points at a file
  // Vite never copies there, and the dev server answers the miss with
  // index.html — which the browser then tries to compile as WebAssembly
  // ("module doesn't start with '\0asm'"). Excluding it keeps the package
  // served from its own directory, next to its .wasm.
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  resolve: {
    alias: {
      // Deep path on purpose: the @meetcc/shared barrel re-exports modules that
      // reach for chrome.*, which does not exist in a Tauri window.
      '@meetcc/shared/i18n': p('../../packages/shared/src/i18n'),
      // Same reason: types and `switchProvider` are pure, the barrel is not.
      '@meetcc/shared/types': p('../../packages/shared/src/types'),
      '@meetcc/shared/provider': p('../../packages/shared/src/provider'),
      '@meetcc/ai': p('../../packages/ai/src'),
      '@meetcc/store': p('../../packages/store/src'),
      '@meetcc/vault': p('../../packages/vault/src'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
