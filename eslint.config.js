// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import mermaid from './tools/eslint-plugin/index.js';

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
      // v12 Playwright harness and corpus, parked until the visual-baseline ticket revives it.
      'e2e/',
      'playwright.config.ts',
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
