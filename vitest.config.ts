import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@meetcc/shared': p('./packages/shared/src'),
      '@meetcc/ai': p('./packages/ai/src'),
      '@meetcc/meeting': p('./packages/meeting/src'),
      '@meetcc/exporters': p('./packages/exporters/src'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', 'packages/shared/src/storage.ts'],
    },
  },
});
