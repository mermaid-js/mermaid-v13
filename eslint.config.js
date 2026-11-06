// @ts-check
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import sonarjs from 'eslint-plugin-sonarjs';
import tsdoc from 'eslint-plugin-tsdoc';
import unicorn from 'eslint-plugin-unicorn';
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
      '!e2e/helpers/platform-harness.spec.ts',
      '!e2e/platform/',
      '!e2e/platform/*.spec.ts',
      '!e2e/platform/harness/',
      '!e2e/platform/harness/**',
      // Lint-rule fixtures are linted on purpose by tools/eslint-plugin tests only.
      'tools/**/fixtures/',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2021, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      'no-only-tests': noOnlyTests,
      '@eslint-community/eslint-comments': comments,
      sonarjs,
      tsdoc,
      unicorn,
    },
    rules: {
      'no-only-tests/no-only-tests': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use a union type instead of an enum.' },
      ],

      // Carried over from v12.
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-definitions': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          custom: { regex: '^I[A-Z]', match: false },
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'tsdoc/syntax': 'error',
      'unicorn/better-regex': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/no-typeof-undefined': 'error',
      'unicorn/no-unnecessary-await': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-index-of': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-negative-index': 'error',
      'unicorn/prefer-object-from-entries': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/string-content': 'error',
      // v12's stylistic set prefers `x!` to `x as T`, and flags `a! === b`; v13 keeps both.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      '@typescript-eslint/no-confusing-non-null-assertion': 'off',
      // Its fix rewrites index loops to `.entries()`, which allocates per element in hot loops;
      // `prefer-for-of` covers the loops that only read the element.
      'unicorn/no-for-loop': 'off',
      // `s || fallback` on a string means "empty counts as missing", which `??` would change.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],

      // Added for v13: type-aware checks, and the slips generated code tends to make.
      eqeqeq: 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      'no-else-return': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-warning-comments': 'error',
      'object-shorthand': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@eslint-community/eslint-comments/disable-enable-pair': ['error', { allowWholeFile: true }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/require-description': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-dead-store': 'error',
      'sonarjs/no-gratuitous-expressions': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-unused-collection': 'error',
      'sonarjs/prefer-single-boolean-return': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Test doubles: stubs, unbound spies and async callbacks without awaits are normal here.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Ported verbatim from v12 by scripts/port-v12-specs.ts, which adds the blanket disable.
    files: [
      'packages/diagram-flowchart/src/v12-specs/**',
      'packages/diagram-sequence/src/v12-specs/*.spec.ts',
      'packages/diagram-class/src/v12-specs/**',
      'packages/diagram-er/src/v12-specs/**',
      'packages/diagram-state/src/v12-specs/**',
      'packages/diagram-journey/src/v12-specs/*.spec.ts',
      'packages/diagram-quadrant/src/v12-specs/**',
      'packages/diagram-timeline/src/v12-specs/**',
      'packages/diagram-pie/src/v12-specs/*.spec.ts',
      'packages/diagram-radar/src/v12-specs/*.spec.ts',
    ],
    rules: {
      '@eslint-community/eslint-comments/disable-enable-pair': 'off',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'off',
      '@eslint-community/eslint-comments/require-description': 'off',
      'unicorn/no-abusive-eslint-disable': 'off',
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
    // Scanners advance the position they are given (`pos`, `at`) by design.
    files: [
      'packages/core/src/parser-kit/**/*.ts',
      'packages/core/src/preprocess/**/*.ts',
      'packages/diagram-*/src/parser/**/*.ts',
    ],
    rules: { 'no-param-reassign': 'off' },
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
