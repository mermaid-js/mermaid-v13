import { defineConfig } from 'vitest/config';

// One root config for the whole workspace. Tests run in plain Node: there is no DOM
// shim anywhere (R-ARCH-1). Workspace packages resolve to their TypeScript sources via
// the `mermaid-source` export condition, so no build is needed before testing.
export default defineConfig({
  resolve: { conditions: ['mermaid-source'] },
  ssr: { resolve: { conditions: ['mermaid-source'], externalConditions: ['mermaid-source'] } },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.spec.ts', 'tools/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tools/**/fixtures/**'],
  },
});
