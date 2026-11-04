import { defaultClientConditions, defineConfig } from 'vite';

// The workspace packages resolve to their TypeScript sources (`mermaid-source`), so the
// example needs no package build. `@mermaid-js/diagram-flowchart` is installed: the service
// imports its `./language` facet dynamically, and Vite resolves that import at build time.
export default defineConfig({
  resolve: { conditions: ['mermaid-source', ...defaultClientConditions] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4096 },
});
