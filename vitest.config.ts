import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@meetcc/shared': p('./packages/shared/src'),
      '@meetcc/ai': p('./packages/ai/src'),
      '@meetcc/meeting': p('./packages/meeting/src'),
      '@meetcc/store': p('./packages/store/src'),
      '@meetcc/mcp': p('./packages/mcp/src'),
      '@meetcc/exporters': p('./packages/exporters/src'),
    },
  },
  test: {
    // node is the default because the packages are DOM-free by design; the
    // dashboard's own tests opt into jsdom with a `@vitest-environment`
    // docblock so the browser environment is only paid for where it is used.
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
      // the installer ships as plain .mjs, outside any workspace
      'scripts/**/*.test.mjs',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', 'packages/shared/src/storage.ts'],
    },
  },
});
