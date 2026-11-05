# @mermaid-js/bundler-plugin (v13 alpha)

One line in your bundler config, and the Mermaid plugins installed in your app's `node_modules` render with no registration code: third-party diagrams (each detector bundled, each diagram in its own chunk that loads on first use) and extensions such as `@mermaid-js/plugin-interactions`.

```js
// vite.config.js — likewise /webpack, /rollup and /esbuild
import mermaid from '@mermaid-js/bundler-plugin/vite';

export default { plugins: [mermaid()] };
```

At build time the plugin scans the `node_modules` of the nearest `package.json` at or above the bundler's project root (Vite `root`, webpack `context`, esbuild `absWorkingDir`, else the working directory; `mermaid({ root })` overrides it), with the same rules as Mermaid's Node discovery: only the app's own top-level and `@scope` packages, every manifest path confined to its package. A package that fails is skipped with a build warning and a `PLUGIN_SKIPPED` warning on the first render. `initialize({ discovery: false })` turns the discovered plugins off at runtime.

Install `@mermaid-js/bundler-plugin@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
