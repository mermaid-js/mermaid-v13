// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import mermaid from './tools/eslint-plugin/index.ts';

// Browser-only globals: everything in the browser set that Node and the language do not
// also provide (so `URL`, `TextEncoder`, `performance`, timers stay usable), plus
// `globalThis`, the back door to all of them.
const portable = new Set([
  ...Object.keys(globals['shared-node-browser']),
  ...Object.keys(globals.es2021),
]);
const DOM_GLOBALS = [
  ...Object.keys(globals.browser).filter((name) => !portable.has(name) && name !== 'console'),
  'navigator',
  'globalThis',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/generated/',
      '**/coverage/',
      '.claude/',
      '.tmp/',
      // The v12 Playwright harness and corpus stay parked; only the parts the v13 visual
      // baseline (R-TEST-5) runs are linted.
      'e2e/**/*',
      '!e2e/browser/',
      '!e2e/browser/**',
      '!e2e/dev/',
      '!e2e/dev/**',
      '!e2e/smoke/',
      '!e2e/smoke/**',
      '!e2e/dom/',
      '!e2e/dom/**',
      '!e2e/helpers/',
      '!e2e/helpers/util.ts',
      '!e2e/helpers/mmd-snapshots.ts',
      '!e2e/helpers/mmd-snapshots.spec.ts',
      '!e2e/helpers/argos-metadata.ts',
      '!e2e/helpers/argos-metadata.spec.ts',
      '!e2e/rendering/',
      '!e2e/rendering/mmd-snapshots.spec.ts',
      // Lint-rule fixtures are linted on purpose by tools/eslint-plugin tests only.
      'tools/**/fixtures/',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2021, ...globals.node },
    },
    plugins: { 'no-only-tests': noOnlyTests },
    rules: {
      'no-only-tests/no-only-tests': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use a union type instead of an enum.' },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.{ts,js}'],
    plugins: { mermaid },
    rules: {
      'mermaid/import-boundaries': 'error',
      'mermaid/no-nested-quantifier': 'error',
    },
  },
  {
    // Readability limits. Existing violations live in eslint-suppressions.json; new ones fail.
    files: ['packages/*/src/**/*.{ts,js}'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'mermaid/no-magic-char-code': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      complexity: ['error', 25],
      'max-depth': ['error', 4],
      'max-params': ['error', 6],
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // The DOM-free, console-free, config-global-free layer (R-ARCH-1, R-ARCH-5, R-ERR-4).
    files: ['packages/core/src/**/*.{ts,js}', 'packages/diagram-*/src/**/*.{ts,js}'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-globals': [
        'error',
        ...DOM_GLOBALS.map((name) => ({
          name,
          message: `'${name}' is a DOM/browser global. Core and diagram packages are DOM-free (R-ARCH-1); take what you need as a parameter.`,
        })),
      ],
      'no-console': 'error',
      'mermaid/no-global-config': 'error',
    },
  },
  prettier
);
