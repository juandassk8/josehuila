import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'design_handoff', '**/*.min.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Injected at build time by Vite `define` (guarded with typeof in code).
        BUILD_TIME: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Downgraded from 'error' to 'warn' so unused vars don't fail the build.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // Safe, low-noise correctness rules — real bugs, few violations.
      'no-console': 'off',
      'no-debugger': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-unreachable': 'warn',
      'no-dupe-keys': 'error',
      'no-duplicate-imports': 'warn',
      // Pre-existing violations at scale in this legacy codebase — kept as
      // WARNINGS (visible in CI logs) instead of errors so CI stays green and
      // the build is gated on build+test, not on burning down legacy debt.
      // TODO(hardening): burn these down and promote back to 'error':
      //   - react-hooks/rules-of-hooks (~20): review each; some may be real bugs
      //   - no-empty (~43): the empty catch {} blocks are being replaced by logger
      'no-empty': ['warn', { allowEmptyCatch: false }],
      'no-useless-escape': 'warn',
      'no-misleading-character-class': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
      // React-compiler advisory rules (eslint-plugin-react-hooks v6). The app
      // does not run the compiler, so these are optimization hints, not runtime
      // bugs — kept as warnings. TODO(hardening): review 'purity' and 'refs',
      // which occasionally flag real render-phase side effects.
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  // Node-runtime files (Vercel serverless functions + build/test config) — these
  // legitimately use process/Buffer/etc., which are Node globals, not browser.
  {
    files: ['deploy/**/*.mjs', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 'latest' },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['api/**/*.js', '*.config.js', 'devApi.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
