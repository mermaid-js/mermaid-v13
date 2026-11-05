---
'@mermaid-js/bundler-plugin': patch
---

feat: first release of `@mermaid-js/bundler-plugin`, one-line Mermaid plugin discovery for Vite, webpack, Rollup and esbuild: `plugins: [mermaid()]` (from `@mermaid-js/bundler-plugin/vite`, `/webpack`, `/rollup` or `/esbuild`). At build time it scans the app's own `node_modules` for packages with a `mermaid` manifest and bundles each detector, with each diagram entry in its own lazily loaded chunk. Installed extensions, `@mermaid-js/plugin-interactions` among them, are activated with no registration code.
