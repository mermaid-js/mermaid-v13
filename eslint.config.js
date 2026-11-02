// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
  prettier
);
