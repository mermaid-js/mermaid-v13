import { defaultClientConditions, defineConfig } from 'vite';

// Workspace packages resolve to their TypeScript sources (`mermaid-source`), as everywhere
// else in the repo, so the example needs no package build. `@mermaid-js/diagram-flowchart` is
// installed here: the language service's facet loader imports its optional `./language`
// subpath, which a bundler must resolve at build time (GAPS, #31).
export default defineConfig({
  resolve: { conditions: ['mermaid-source', ...defaultClientConditions] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2048 },
});
