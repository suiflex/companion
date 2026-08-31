import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Deliberately the non-type-checked preset: `tsc --noEmit` already runs in the
// same pipeline and is the authority on types, so lint only covers what the
// compiler does not — unused vars, unreachable branches, hook rules.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-firefox/**',
      '**/node_modules/**',
      'coverage/**',
      'docs/.obsidian/**',
      'docs/mockup/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // `_`-prefixed arguments are the project's way of saying "required by
      // the signature, unused here".
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // The `any`s left in the codebase all sit on JSON parse boundaries where
      // the value is narrowed immediately after by the local `str`/`num`
      // helpers. Worth seeing, not worth failing a build over.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // The dashboard is a browser document; the service worker and content script
  // get the extension APIs too.
  {
    files: ['apps/extension/**/*.{ts,tsx,js}'],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
  },
  {
    files: ['apps/extension/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Build/dev scripts run under node.
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['spikes/native-messaging-installer/**/*.cjs'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['spikes/native-messaging-installer/extension/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },

  // The query builders here use `(push(...), push(...))` comma sequences to
  // keep one filter on one line. That is the file's established shape; the
  // rule would only be satisfied by reformatting unrelated queries.
  {
    files: ['packages/store/src/store.ts'],
    rules: { '@typescript-eslint/no-unused-expressions': 'off' },
  },
);
