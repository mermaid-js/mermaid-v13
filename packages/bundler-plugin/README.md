# @mermaid-js/bundler-plugin (v13 alpha)

One line in your bundler config, and the Mermaid plugins installed in your app's `node_modules` render with no registration code: third-party diagrams (each detector bundled, each diagram in its own chunk that loads on first use) and extensions such as `@mermaid-js/plugin-interactions`.

```js
// vite.config.js — likewise /webpack, /rollup and /esbuild
import mermaid from '@mermaid-js/bundler-plugin/vite';

export default { plugins: [mermaid()] };
```

At build time the plugin scans the `node_modules` of the nearest `package.json` at or above the bundler's project root (Vite `root`, webpack `context`, esbuild `absWorkingDir`, else the working directory; `mermaid({ root })` overrides it), with the same rules as Mermaid's Node discovery: only the app's own top-level and `@scope` packages, every manifest path confined to its package. A package that fails is skipped with a build warning (paths relative to the app root; nothing about the build machine goes into the bundle). `initialize({ discovery: false })` turns the discovered plugins off at runtime. Watch mode, Vite dev and webpack's persistent cache rebuild the plugin list when a package is installed or removed.

Vite dev: the plugin keeps `mermaid` out of dependency pre-bundling (`optimizeDeps.exclude`). If another dependency bundles `mermaid` inside itself (a wrapper component, for example), add that dependency to `optimizeDeps.exclude` too, or its copy of `mermaid` will not see the discovered plugins in dev (production builds are not affected).

For plugin authors: a diagram's `detector` module is bundled eagerly and evaluated while `mermaid` itself loads, so it must not import `mermaid` (that is an import cycle), and it should be its own small module, not the `entry` (a detector that is the entry makes the whole diagram eager; the plugin warns).

Install `@mermaid-js/bundler-plugin@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
