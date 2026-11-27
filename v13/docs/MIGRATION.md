# Migrating from Mermaid v12 to v13

This guide lists every removed feature, changed default and config key in v13, each with its
replacement (R-COMPAT-9). It is written for integrators: sites, editors and tools that call
Mermaid, style its SVG or read its config. Diagram authors mostly need the sections on
[labels](#labels-and-text), [flowchart syntax](#flowchart-syntax) and
[front matter](#front-matter-and-directives).

Requirement (`R-…`) and decision (`D…`) ids point into [REQUIREMENTS.md](./REQUIREMENTS.md) and
[DECISIONS.md](./DECISIONS.md). The config section is generated from the schema; the per-key
status of every config key is in [config-reference.md](./config-reference.md), and every theme
variable is in [theme-variables.md](./theme-variables.md).

> **Status: 13.0 alpha (milestone M1).** Flowchart is the only diagram type with a v13 renderer.
> Every other v12 type is still detected, and rendering it fails with `UNSUPPORTED_DIAGRAM`
> until its package is ported. Some replacements named here are not released yet; they are
> marked _(later in M1)_ or with their milestone.

## At a glance

What most integrators have to change:

1. Replace `mermaidAPI.*` calls with the top-level functions ([Public API](#public-api)).
2. Stop relying on `htmlLabels`, `<foreignObject>` labels and `dompurifyConfig`: labels are SVG
   text ([Labels](#labels-and-text)). If your diagrams need HTML in labels, register the optional
   HTML labels plugin ([HTML labels](#html-labels)).
3. Click callbacks (`click A callback`, `call fn()`) and `bindFunctions` need
   `@mermaid-js/plugin-interactions`, and callbacks still need `securityLevel: 'loose'`
   ([Click callbacks](#click-callbacks-and-bindfunctions)).
4. For link URLs, `securityLevel: 'loose'` (and `antiscript`, `sandbox`) now means `default`;
   `strict` now allows relative links only ([securityLevel](#securitylevel)).
5. CSS that targets element ids, `<marker>`, `.label-container` or the `<style>` element inside
   the SVG must move to the kept class names and `--mermaid-*` CSS variables
   ([Flowchart SVG structure](#flowchart-svg-structure), [Themes](#themes)).
6. The default theme is `redux-color`, the theme v12's flowchart renders by default, and the
   default layout is `layered`; set `theme: 'default'` to keep v12's `default` colours and
   classic geometry ([Changed defaults](#changed-defaults), [Themes](#themes)).
7. `look` is ignored with a `LOOK_REMOVED` warning; neo and classic geometry now come with the
   theme ([Themes](#themes)). `look: handDrawn` needs `@mermaid-js/plugin-hand-drawn`
   ([Hand-drawn look](#hand-drawn-look)).
8. Render errors are thrown as `MermaidError`; nothing is drawn into the page for you
   ([Errors](#errors-and-the-error-image)).
9. `mermaid.min.js` is now a small loader that imports the ES module build: the browser needs
   ES2022 module support, and the `chunks/` folder must be served next to it. Plugins are found
   on install in Node, through `@mermaid-js/bundler-plugin` in bundlers and through
   `globalThis.mermaidPlugins` on a CDN ([Loading and plugins](#loading-and-plugins)).
10. Font Awesome's CSS no longer draws `fa:fa-car` in labels: register an icon pack (for example
    `@iconify-json/fa6-solid` as `fa`) and `@mermaid-js/plugin-icons` ([Icons](#icons)).

## Packages

| v12 | v13 | Why |
| --- | --- | --- |
| One `mermaid` package with every diagram type and its dependencies (d3, dagre, DOMPurify, khroma, KaTeX, …) | `mermaid` depends on `@mermaid-js/core` (pipeline, parser kit, layout, SVG writer, text, themes, config) and one `@mermaid-js/diagram-<type>` package per diagram type. `mermaid` has no other runtime dependencies | Small, DOM-free bundles (R-PERF-1, R-PERF-2) |
| ESM, IIFE (`mermaid.min.js`) and "tiny" builds | Each package ships its compiled ES modules (`dist/`), Node 20 or newer. `mermaid` also ships a CDN build: `dist/mermaid.esm.min.mjs` with a chunk per diagram type, and `dist/mermaid.min.js`, a classic-script loader for it ([Loading and plugins](#loading-and-plugins)). There is no full non-lazy IIFE and no tiny build | D162, R-ARCH-8 |
| `mermaid@latest`, released from `develop` | Alphas are released from `mermaid-v13`, with dist-tag `v13-alpha` only, so `mermaid@latest` stays v12: install `mermaid@v13-alpha`. Public `mermaid@13.0.0-alpha.N` starts at `13.0.0-alpha.0` (D159) | R-REL-2, R-REL-3, D28, D159 |
| No language-service or editor packages | Editor support is published as packages: `@mermaid-js/language-service` (editor-agnostic), `@mermaid-js/language-server` (LSP over stdio), and the adapters `@mermaid-js/language-service-codemirror` (CodeMirror 6) and `@mermaid-js/language-service-monaco` (Monaco). The adapters ship the generated first-paint grammars, one lazily loaded file per diagram type; the diagram packages ship none | R-LANG-2, D135, D158 |
| `@mermaid-js/layout-elk` | Same name, a 13.x line. Register it as in v12 (`mermaid.registerLayoutLoaders(elkLayouts)`); without it `layout: elk` draws with the built-in engine and warns `ELK_NOT_INSTALLED` ([ELK](#elk)) | R-PLUG-8, D171 |
| `look: handDrawn`, drawn by roughjs inside `mermaid` | `@mermaid-js/plugin-hand-drawn`, an optional extension with roughjs 4.6.6 as its one dependency. Installed is enabled; without it `look: handDrawn` draws the plain diagram and warns `LOOK_REMOVED` ([Hand-drawn look](#hand-drawn-look)) | R-PLUG-8, D300 |
| HTML labels (`htmlLabels: true`, the flowchart default), drawn by `mermaid` and sanitised by DOMPurify | `@mermaid-js/plugin-html-labels`, an optional extension with DOMPurify as its one dependency. Without it labels are SVG text ([HTML labels](#html-labels)) | D694 |
| ZenUML, tidy-tree and the example diagram package | Not ported in M1 | |

## Loading and plugins

### The CDN script (`mermaid.min.js`)

v12's `mermaid.min.js` was one IIFE with every diagram type in it. In v13 it is a loader of
under 1 KB gz (D162): it sets `globalThis.mermaid` at once, then `import()`s
`mermaid.esm.min.mjs` from its own directory, and each diagram type, theme and text-output entry
loads from `chunks/` on first use. Both v12 tags keep working:

```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@v13-alpha/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true });</script>

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@v13-alpha/dist/mermaid.esm.min.mjs';
</script>
```

- **The browser needs ES2022 module support** (R-ARCH-8): the loader is a classic script, but
  everything it loads is an ES module. There are no polyfills and no fallback build.
- **Serve `chunks/` next to the file.** If you self-host, copy the whole `dist/` folder
  (`mermaid.min.js`, `mermaid.esm.min.mjs` and `chunks/`), not just one file. A bare package URL
  (`https://unpkg.com/mermaid@13`) works: the loader then looks in `dist/`.
- **Chunks from somewhere else (D163).** Put `data-cdn-base="https://mirror.example/mermaid/"`
  on the `mermaid.min.js` tag to load the whole build (ESM file and every chunk) from that base.
  With the ES module build, `initialize({ cdnBase })` moves the lazy chunks; a base other than
  the ESM file's own directory works but warns, because the shared core chunks then load twice.
  `cdnBase` is integrator-only: front matter and `%%{init}%%` cannot set it, and no URL in
  diagram text ever leads to a load (R-PLUG-7).
- Calls made before the build has loaded (`initialize`, `run`, `render`, …) are queued and
  replayed in order; the async ones return the real result. `renderSync`, `detectType`,
  `supportsFormat` and `mount` throw until it has loaded: call them after `await
  mermaid.preload()`.

### Plugins: installed is enabled (R-PLUG-5)

v12 needed a `registerExternalDiagrams` call for every third-party diagram. In v13 a package
with a `mermaid` manifest in its `package.json` is found on install, and each path loads only
the detector up front and the diagram itself on first use. `registerExternalDiagrams` still
works everywhere (R-PLUG-6).

| Where | What to do | D-id |
| --- | --- | --- |
| Node, SSR | Nothing. On first render `mermaid` looks in the `node_modules` of the nearest `package.json` at or above `process.cwd()` (never parent folders) for the packages that `package.json` lists in `dependencies`, `devDependencies`, `optionalDependencies` or `peerDependencies`. A plugin must be listed there to be found: one installed only as a dependency of another package is not. A package with a bad manifest, a path outside the package or a detector that takes over 5 s to import is skipped with a `PLUGIN_SKIPPED` warning in `RenderResult.warnings`. A server deployed without `node_modules` gets no warning | D165, D589 |
| Bundlers | Add `@mermaid-js/bundler-plugin`: `plugins: [mermaid()]` with `mermaid` from `@mermaid-js/bundler-plugin/vite`, `/webpack`, `/rollup` or `/esbuild`. It scans at build time; skipped packages are build warnings. Without it a browser bundle has the first-party types and what you register | D164 |
| CDN | Add the plugin's script tag, before or after `mermaid.min.js`. The script pushes itself onto `globalThis.mermaidPlugins` with its npm package name (`(globalThis.mermaidPlugins ??= []).push({ ...plugin, package: 'my-plugin' })`), so it orders as in an npm install; without `package` mermaid warns. Load `mermaid` once: a second copy on the page warns and leaves the plugins and the startOnLoad render to the first | D167 |

- **Turning it off:** `initialize({ discovery: false })` stops Node discovery and ignores the
  bundler plugin's list. Like `cdnBase`, `discovery` is integrator-only.
- **Discovery runs on the first `render`, `prepare`, `parse` or `preload`.** `renderSync`,
  `detectType` and `supportsFormat` do not wait for it: `await mermaid.preload()` first. A
  render waits for a plugin that is still loading for a limited time (5 s), then goes on with a
  `PLUGIN_DISCOVERY_FAILED` warning; the plugin works on later renders once it has loaded.
- **Order (D166).** First-party types always win: a discovered package that claims a first-party
  id or type (`flowchart`, `pie`, …) is skipped with a warning. Replacing one takes
  `registerExternalDiagrams([plugin], { replace: true })`. Third-party detectors run after the
  first-party ones, sorted by package name, then the explicitly registered ones in call order.
  An explicitly registered id wins over a discovered one, with no warning.
- **Extensions activate on install too (D169).** With `@mermaid-js/plugin-interactions`
  installed, Node discovery and the bundler plugin turn click callbacks on with no
  `registerExternalDiagrams` call. Diagram text still cannot enable it.
- First-party diagram types need none of this: `mermaid` depends on every
  `@mermaid-js/diagram-*` package and bundlers split them per type (R-PLUG-4).
- The `mermaid` CLI does not discover plugins yet.
- **Writer wrappers.** `SvgWriter` (`@mermaid-js/core/svg`) gains a required `linearGradient`
  member, for the user-space gradients sankey draws (D391): a third-party plugin that wraps the
  writer must forward it.

## Public API

`render`, `parse`, `initialize` and `run` keep their v12 call signatures (R-COMPAT-5); a type
test checks them against the mermaid@12 declarations.

| v12 | v13 | Why |
| --- | --- | --- |
| `mermaidAPI` object (`getConfig`, `setConfig`, `reset`, …) | Removed | No global render state (R-API-5); config goes through `initialize()` |
| `render(id, text, container?)` → `{ svg, diagramType, bindFunctions? }` | Same call; the result adds `width`, `height` and `warnings`. `container` is accepted and ignored (v13 measures without the DOM) | R-API-1, R-ERR-4 |
| `render(id)` sets the root `<svg id>` | `id` prefixes the ids the output writes (`<id>-title`, `<id>-desc`); the root has no `id`. Without an `id` (`renderSync`, SSR) the prefix is `mermaid-<hash>` of the text and resolved config | Ids stay unique per diagram and output stays deterministic; pass an `id` to show the same text twice on a page |
| `render()` needs a browser DOM (or jsdom) to measure text | Renders in Node, Deno, workers and browsers without a DOM. Text is measured with canvas when it exists, otherwise with built-in font tables; `initialize({ deterministic: true })` always uses the tables (even over a `measurer`), `initialize({ measurer })` plugs in your own | R-TEXT-4, R-ARCH-1 |
| Errors are `Error`s with jison text (`Parse error on line 3 … Expecting 'SQE'`) and `hash.loc` | `MermaidError { code, message, line, column, offset, length, expected?, diagnostics }`; `code` is `SYNTAX`, `SEMANTIC`, `UNSUPPORTED_DIAGRAM`, `UNSUPPORTED_FORMAT`, `NOT_LOADED`, `LIMIT` or `INTERNAL`; lines count from the top of the source, front matter included | R-ERR-1, R-ERR-2, D68 |
| A diagram type without a renderer, or unknown text, throws `UnknownDiagramError` | `MermaidError` with `code: 'UNSUPPORTED_DIAGRAM'` (every v12 type is still detected, in v12 order) | R-COMPAT-7 |
| `detectType(text)` throws `UnknownDiagramError` | Throws `MermaidError` (`UNSUPPORTED_DIAGRAM`) | R-ERR-1 |
| `parse()` → `{ diagramType, config }` | Adds `warnings`; `config` (front matter and directives) leaves out the integrator-only keys. `parse(text, { suppressErrors: true })` still resolves to `false` | R-SEC-5 |
| Logging to the console | Nothing is written to the console; warnings are in `RenderResult.warnings` | R-ERR-4 |
| — | New: `prepare(text)` + `renderSync(text, options)`, `preload({ types, layouts, themes })`, `supportsFormat(type, format)`, `createMermaid()` (an API object with its own registry and defaults) | R-API-2, R-ASCII-5 |
| `run()`, `startOnLoad`, `contentLoaded()` | Same: `run()` renders every unprocessed `.mermaid` element (marking it `data-processed`), puts the error image in place of a failing one, carries on, and rejects with the first `MermaidError` at the end unless `suppressErrors`. `startOnLoad` runs it on `window` load; `mermaid.startOnLoad = false` still stops that, as does `initialize({ startOnLoad: false })`. Diagram ids are `mermaid-<n>` from a counter (v12 used `Date.now()` unless `deterministicIds`). Elements inside a drawn `<svg>` are skipped, because v13's svg root has class `mermaid` | R-API-6, R-ERR-3 |
| `init(config?, nodes?, callback?)`, deprecated since v10 | Still there and still deprecated: `initialize(config)`, then `run({ querySelector \| nodes, postRenderCallback: callback })`. Use those two instead | D643 |
| `getRegisteredDiagramsMetadata()` → `[{ id }]` | Still there, deprecated: the same ids in the same order (`error`, `---`, then every detectable type). Use `detectType(text)` to name a text's type and `supportsFormat(type, format)` to ask whether it draws | D643 |
| — | New: `mount(el, text, { availableWidth?, config?, id? })` → `{ ready, result, error, update(text), destroy() }`. It re-renders when the element is resized only with `availableWidth: true`, re-measures after a web font loads, and needs no re-render on theme change (set `--mermaid-*` on a parent) | R-API-7, D33 |
| — | New: `renderSync(text, { availableWidth })` fits graph layouts to a width (R-LAYOUT-5) | R-LAYOUT-5 |
| `registerExternalDiagrams([{ id, detector, loader }])` where the loader returns a v12 `DiagramDefinition` (parser, db, D3 renderer) | Same call shape, but the loader returns a v13 diagram plugin `{ id, detector, parse, layout?, render }`. v12 diagram definitions do not run in v13 | D35, R-PLUG-2 |
| `registerLayoutLoaders([{ name, loader, algorithm? }])` where the loader returns a DOM renderer | `registerLayoutLoaders([{ name, loader }])` where the loader returns a layout engine `(graph, ctx?) → LayoutModel`; selected with `layout:` | R-LAYOUT-2 |
| `layout: elk` / `elk.<algorithm>` uses the ELK package | Laid out by `@mermaid-js/layout-elk` once registered (`mermaid.registerLayoutLoaders(elkLayouts)`, as in v12; it registers v12's seven names plus `elk.layered` and `elk.radial`); without it, drawn with the built-in `layered` engine and one `ELK_NOT_INSTALLED` warning naming the package | DESIGN §6.1, D171, D173 |
| `registerIconPacks([{ name, icons } \| { name, loader }])` | Same call shape and quirks (`name` overrides the pack's `prefix`; a loader may return the pack itself). Packs belong to one `mermaid` object (`createMermaid()`), not the page, and are drawn by `@mermaid-js/plugin-icons`. Loaders run in `prepare()`/`render()` only for a diagram that names their pack, or in the new `preload({ iconPacks })`; a rejecting loader no longer fails the render. See [Icons](#icons) | R-API-2, R-API-3, D290, D294, D299 |
| `setParseErrorHandler(fn)` or `mermaid.parseError = fn` gets the raw error | Both deprecated and still the same hook; `fn` gets the `MermaidError` of a failed `parse()` or `render()`, and of each element `run()` fails to draw | R-API-4 |
| `initialize()` replaces the site config | Same: it swaps in a new frozen defaults object; renders already started keep the old one | R-ARCH-4, D72 |
| Integrator options beyond the schema | `initialize()` also takes `measurer`, `deterministic`, `fontTables`, `linkSchemes`, `output.cssVariables` and `limits`; diagram text can never set them. `fontTables` adds font tables to the table measurer (Node, workers and `deterministic: true`), so a brand font is measured as itself rather than as Arial. They load and are checked with the first `prepare()`, `render()` or `preload()`, so a malformed table rejects that call, not `initialize()` | R-SEC-5, R-SEC-6, D645 |
| Text over `maxTextSize` renders a "Maximum text size in diagram exceeded" placeholder diagram; over `maxEdges` throws an `Error` | Both reject with `MermaidError { code: 'LIMIT' }`, as do the new caps (see Limits) | R-SEC-5, D31 |
| `RenderResult.bindFunctions` is set when the diagram has click callbacks | Set only when `@mermaid-js/plugin-interactions` is installed | R-PLUG-9 |

### securityLevel

`securityLevel` has two levels (D48, D75). The new default, `default`, keeps `http`, `https`,
`mailto` and relative link URLs, which is what v12's default `strict` kept. **`strict` now keeps
relative links only**: an integrator who set `securityLevel: 'strict'` explicitly loses absolute
links and gets a `URL_REFUSED` warning per dropped link. Set `securityLevel: 'default'` (or
leave it unset) to keep them. `antiscript` and `sandbox` act as `default` with a
`SECURITY_LEVEL` warning; there is no sandbox iframe mode and no HTML in labels. `loose` acts
as `default` for link URLs too, with no warning, because it still turns callbacks on (D634).

In v12, `loose` was also what allowed click callbacks and HTML labels. In v13 HTML labels need
the optional HTML labels plugin, whatever the level ([HTML labels](#html-labels)). Callbacks need the interactions plugin and, as in v12, `securityLevel: 'loose'` (D554):
that is the one thing `loose` still turns on, and for link URLs it acts as `default`. Only
`initialize()` can set `securityLevel`; front matter and directives cannot (as in v12, where it
was in `secure`). `initialize({ linkSchemes: [...] })` replaces the scheme list of `default`.

Link URLs are written as given, with control characters and entity codes removed; v12 passed
them through `@braintree/sanitize-url`, which also normalised them (`https://example.com`
became `https://example.com/`). A link target other than `_self`, `_blank`, `_parent` or
`_top` is dropped with `LINK_TARGET_DROPPED`, and `_blank` links get
`rel="noopener noreferrer"`.

### Limits

Every render is bounded (R-SEC-5, D31). The integrator sets the limits with `initialize({ limits })`
or a per-call `config.limits`; v12's `maxTextSize` and `maxEdges` still work and an explicit
`limits` entry wins over them. Front matter and directives cannot change any of them (the attempt
is reported as a `CONFIG_SECURE_KEY` warning). Over a limit, the render rejects with
`MermaidError { code: 'LIMIT' }`.

| Limit | Default | v12 |
| --- | --- | --- |
| `maxSourceLength` | 50,000 characters, front matter included (checked before the text is read) | `maxTextSize` 50,000, placeholder diagram |
| `maxEdges` | 5,000 (`A & B --> C & D` counts four; refused before any is made) | `maxEdges` 500 |
| `maxNodes` | 10,000 | none |
| `maxDepth` | subgraphs nested 100 deep; a stack overflow in any stage is reported as this limit | none |
| `maxOutputLength` | 4,000,000 characters of SVG | none |
| `maxLayoutWork` | 1,500,000 steps of a layout loop the text can make long (`MAX_STEPS`, D542); gantt counts each day its schedule walks for excluded days, on every pass | none |

### Errors and the error image

v12's `render()` drew the "Syntax error in text" bomb image into the page and then threw,
unless `suppressErrorRendering` was set. In v13 `render()` never touches the DOM: it only
throws the `MermaidError`, also when given a `container`. The DOM adapter (`run()` and
`mount()`) puts the error image in the failing element unless `suppressErrorRendering` is
set, as v12's `run()` did. Elsewhere, draw one yourself with
`renderErrorSvg(error, { version? })`, which returns an inert SVG string with the error code
and message.

`render()` loads what the diagram needs before drawing. The new synchronous
`renderSync(text, options)` throws `NotLoadedError` when a diagram, layout or theme is
registered but not loaded yet (`await preload(...)` or `await prepare(text)` first), unless
`placeholders: true` is passed: it then draws the error image (missing diagram) or a built-in
stand-in (missing layout or theme) and adds a `PLACEHOLDER` warning.

### Click callbacks and bindFunctions

v12 ran click callbacks (`click A callback`, `click A call fn(arg)`) when `securityLevel` was
`loose`, and returned `bindFunctions` to attach them to the inserted SVG. In v13 core output
contains no script (R-SVG-4): callbacks move to `@mermaid-js/plugin-interactions` (D47,
R-PLUG-9), which binds handlers to the rendered DOM after render, using the stable `data-id`
attributes. Without the plugin:

- `click … callback` and `call` statements are still parsed (and errors in them still
  reported), draw nothing, and add one `CALLBACK_IGNORED` warning;
- `RenderResult.bindFunctions` is `undefined`, so `bindFunctions?.(element)` is a no-op;
- `click A "url"` and `click A href "url"` still draw links (they are SVG `<a>` elements, not
  script) and tooltips become SVG `<title>` elements.

With the plugin and `securityLevel: 'loose'`, callbacks work as in v12. In Node, or in a bundle
built with `@mermaid-js/bundler-plugin`, installing the plugin registers it
([Plugins](#plugins-installed-is-enabled-r-plug-5), D169). Otherwise register it once. Diagram
text alone can never turn callbacks on: it can neither register the plugin nor set
`securityLevel`.

```js
import mermaid from 'mermaid';
import interactions from '@mermaid-js/plugin-interactions';

mermaid.initialize({ securityLevel: 'loose' });
await mermaid.registerExternalDiagrams([interactions]);
await mermaid.run(); // binds the callbacks of every diagram it draws

// or, at a v12 render() call site:
const { svg, bindFunctions } = await mermaid.render('id', text);
element.innerHTML = svg;
bindFunctions?.(element);
```

- Function names are looked up on `window` as in v12 (`fn`, `app.handlers.fn`); a missing name
  does nothing. `call fn("a, b", 2)` passes the strings `a, b` and `2`; `callback` and `call fn()`
  pass the node id.
- `run()` and `mount()` call `bindFunctions` for you. Calling it again on the same element binds
  nothing twice.
- As in v12, callbacks run only with `securityLevel: 'loose'` (D554, amends D74). Under
  `default`, `strict`, `antiscript`, `sandbox` or no level, the plugin binds no callback and the
  render adds one `CALLBACK_IGNORED` warning. A callback calls a function on `window` that the
  diagram text names, with arguments the text gives, so set `loose` only for text you trust.
  Links, tooltips and sequence actor menus work under every level.
- `loose` adds no warning (D634). For link URLs it is treated as `default`.
- The plugin does not change the SVG; it adds click listeners to the rendered `g.node[data-id]`
  elements inside the element you pass.

v12 had no click-callback config keys (only `securityLevel` gated them, as it does in v13), so
no schema key is `moved` to the plugin and it has no config section.

<!-- BEGIN GENERATED CONFIG SECTION: pnpm gen:config -->

## Config

Generated from the `x-mermaid` annotations in `packages/core/schema/config.schema.yaml`. The full list is in [config-reference.md](./config-reference.md).

### Removed, moved and ignored keys

| Key | Status | Reason | Replacement |
| --- | --- | --- | --- |
| `themeVariables.THEME_COLOR_LIMIT` | ignored | The numbered `cScale` palettes always have twelve slots and the git palettes eight, and a diagram cycles through them (D258, D267). v12 built that many `cScale` slots and style rules, and its timeline also took the section colour modulo the limit, so `THEME_COLOR_LIMIT: 3` gave the fourth section the first one's colour. v13's timeline cycles every twelve sections whatever the value. |  |
| `themeCSS` | removed | v13 output carries no author stylesheet (R-SEC-2). | `themeVariables`, or `--mermaid-*` CSS variables set by the host page |
| `look` | ignored | `look` is removed (D153): the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. The v12 neo and classic geometry is theme data instead: the redux themes, `neo` and `neo-dark` carry neo geometry and the classic themes carry classic geometry (D152, D181). | `theme`, or the geometry and `dropShadow` theme variables; `handDrawn` comes from the hand-drawn plugin (R-PLUG-8) |
| `htmlLabels` | removed | Core draws labels as SVG text only (D5). | the HTML labels plugin, which reads the key as `html.labels` (D694, D696) |
| `altFontFamily` | ignored | Unused by every renderer, also in v12. |  |
| `logLevel` | ignored | v13 does not log; problems are returned in `RenderResult.warnings`. |  |
| `arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `legacyMathML` | ignored | v13 never emits MathML or KaTeX HTML (D175): a math extension typesets `$$…$$` TeX into SVG paths. |  |
| `forceLegacyMathML` | ignored | v13 never emits MathML or KaTeX HTML (D175): a math extension typesets `$$…$$` TeX into SVG paths. |  |
| `flowchart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render. The redux themes carry v12's `look: neo` geometry (D152). | `theme`, or the geometry and `dropShadow` theme variables |
| `flowchart.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `flowchart.htmlLabels` | removed | Core draws labels as SVG text only (D5). | the HTML labels plugin, which reads the key as `html.labels` (D694, D696) |
| `swimlane.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `agentflow.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the agentflow renderer never did. |  |
| `agentflow.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `sequence.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `sequence.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `sequence.messageMargin` | ignored | v12's sequence renderer never read it; messages are spaced by `boxMargin` and their label height. |  |
| `sequence.messageFont` | ignored | v12's internal font helper; v13 reads the `messageFontSize`, `messageFontFamily` and `messageFontWeight` keys. |  |
| `sequence.noteFont` | ignored | v12's internal font helper; v13 reads the `noteFontSize`, `noteFontFamily` and `noteFontWeight` keys. |  |
| `sequence.actorFont` | ignored | v12's internal font helper; v13 reads the `actorFontSize`, `actorFontFamily` and `actorFontWeight` keys. |  |
| `gantt.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `journey.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the journey renderer never did. |  |
| `journey.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `journey.boxMargin` | ignored | v12's journey renderer read it only in a loop over an empty list, so it had no effect. |  |
| `journey.noteMargin` | ignored | v12's journey renderer never read it. |  |
| `journey.messageMargin` | ignored | v12's journey renderer never read it. |  |
| `journey.messageAlign` | ignored | v12's journey renderer never read it. |  |
| `journey.bottomMarginAdj` | ignored | v12's journey renderer never read it. |  |
| `journey.rightAngles` | ignored | v12's journey renderer never read it. |  |
| `journey.activationWidth` | ignored | v12's journey renderer never read it. |  |
| `journey.textPlacement` | ignored | Every label is SVG text from core label layout, wrapped to its box, in `textColor`, with `<br>` breaking lines (D225); there is no `foreignObject` or `tspan`-only mode. |  |
| `journey.sectionFills` | removed | v12's theme rules hid it. | `fillType<n>`, n 0 to 7 |
| `timeline.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the timeline renderer never did. |  |
| `timeline.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `timeline.diagramMarginX` | ignored | v12's timeline never read it. |  |
| `timeline.diagramMarginY` | ignored | v12's timeline never read it. |  |
| `timeline.width` | ignored | v12's timeline never read it. |  |
| `timeline.height` | ignored | v12's timeline never read it. |  |
| `timeline.boxMargin` | ignored | v12's timeline never read it. |  |
| `timeline.boxTextMargin` | ignored | v12's timeline never read it. |  |
| `timeline.noteMargin` | ignored | v12's timeline never read it. |  |
| `timeline.messageMargin` | ignored | v12's timeline never read it. |  |
| `timeline.messageAlign` | ignored | v12's timeline never read it. |  |
| `timeline.bottomMarginAdj` | ignored | v12's timeline never read it. |  |
| `timeline.rightAngles` | ignored | v12's timeline never read it. |  |
| `timeline.taskFontSize` | ignored | v12's timeline never read it; box text is drawn at `themeVariables.fontSize`. |  |
| `timeline.taskFontFamily` | ignored | v12's timeline never read it; box text is drawn at `themeVariables.fontFamily`. |  |
| `timeline.taskMargin` | ignored | v12's timeline never read it. |  |
| `timeline.activationWidth` | ignored | v12's timeline never read it. |  |
| `timeline.textPlacement` | ignored | v12's timeline never read it. |  |
| `timeline.actorColours` | ignored | v12's timeline never read it; boxes take the `cScale` palettes or `mainBkg`. |  |
| `timeline.sectionFills` | removed | v12 never read it. | `cScale<n>`, `mainBkg` or `borderColorArray` by theme |
| `timeline.sectionColours` | ignored | v12's timeline never read it; box text takes `cScaleLabel` or `nodeBorder`. |  |
| `class.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the class renderers never did. |  |
| `class.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `class.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `class.dividerMargin` | ignored | Read only by v12's old class renderer (`svgDraw.js`), which 12.2.0 no longer reached: both keywords used the unified renderer, which did not read it. |  |
| `class.textHeight` | ignored | Read only by v12's old class renderer (`svgDraw.js`), which 12.2.0 no longer reached: both keywords used the unified renderer, which did not read it. |  |
| `class.htmlLabels` | removed | Core draws labels as SVG text only (D5). | the HTML labels plugin, which reads the key as `html.labels` (D694, D696) |
| `state.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the state renderers never did. |  |
| `state.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `state.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `state.dividerMargin` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.sizeUnit` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.padding` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.textHeight` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.titleShift` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.noteMargin` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.forkWidth` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.forkHeight` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.miniPadding` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.fontSizeFactor` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.fontSize` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.labelHeight` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.edgeLengthFactor` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.compositTitleSize` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `state.radius` | ignored | Read only by v12's old dagre state renderer, which 12.2.0 no longer reached (both keywords used the unified renderer, which did not read it). Sizes come from the theme and state's own metrics. |  |
| `er.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `er.layoutDirection` | ignored | mermaid 12.2.0 does not read it either; only the legacy ER renderer, no longer used, did. The diagram's `direction` statement sets the direction. | `direction TB\|BT\|LR\|RL` in the diagram text |
| `er.minEntityHeight` | ignored | mermaid 12.2.0 does not read it either; only the legacy ER renderer, no longer used, did. An entity is as tall as its rows. |  |
| `er.stroke` | ignored | mermaid 12.2.0 does not read it either; only the legacy ER renderer, no longer used, did. | `themeVariables.nodeBorder` and `lineColor` |
| `er.fill` | ignored | mermaid 12.2.0 does not read it either; only the legacy ER renderer, no longer used, did. | `themeVariables.mainBkg` |
| `er.fontSize` | ignored | mermaid 12.2.0 does not read it either; only the legacy ER renderer, no longer used, did. Entities use the theme font size. | `themeVariables.fontSize` |
| `pie.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the pie renderer never did. |  |
| `pie.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `quadrantChart.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the quadrant chart renderer never did. |  |
| `quadrantChart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `xyChart.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the XY chart renderer never did. |  |
| `xyChart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `xyChart.xAxis.$ref` | ignored | Not an option; 12.2.0's default config leaked it (a schema reference). |  |
| `xyChart.yAxis.$ref` | ignored | Not an option; 12.2.0's default config leaked it (a schema reference). |  |
| `requirement.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the requirement renderer never did. |  |
| `requirement.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `requirement.rect_fill` | ignored | v12.2.0's requirement renderer never read it: boxes are sized from their text and drawn from the theme (D435). |  |
| `requirement.text_color` | ignored | v12.2.0's requirement renderer never read it: the text is `requirementTextColor` (D435). |  |
| `requirement.rect_border_size` | ignored | v12.2.0's requirement renderer never read it: the border is `requirementBorderSize` (D435). |  |
| `requirement.rect_border_color` | ignored | v12.2.0's requirement renderer never read it: the border is `requirementBorderColor` (D435). |  |
| `requirement.rect_min_width` | ignored | v12.2.0's requirement renderer never read it: a box is as wide as its widest line plus its padding (D436). |  |
| `requirement.rect_min_height` | ignored | v12.2.0's requirement renderer never read it: a box is as tall as its lines plus its padding (D436). |  |
| `requirement.fontSize` | ignored | v12.2.0's requirement renderer never read it: the text takes the theme's `fontSize`, or a box's `font-size` style. |  |
| `requirement.rect_padding` | ignored | v12.2.0's requirement renderer never read it: boxes are padded 20, as v12 drew them (D436). |  |
| `requirement.line_height` | ignored | v12.2.0's requirement renderer never read it: each line is as tall as its measured text (D436). |  |
| `architecture.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the architecture renderer never did. |  |
| `architecture.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `architecture.fontSize` | ignored | In v12 it sized only cytoscape's own label style and moved a group's title by half of it; the text was drawn in the global font size. v13 draws every architecture label in the theme's `fontSize`, as v12 drew the text (D507). | `themeVariables.fontSize` |
| `architecture.randomize` | ignored | An fcose setting (D328): v13 lays architecture out with the `compass` grid engine (D326), which is deterministic and has no solver to tune. | none |
| `architecture.nodeSeparation` | ignored | An fcose setting (D328): v13 lays architecture out with the `compass` grid engine (D326), which is deterministic and has no solver to tune. | none |
| `architecture.idealEdgeLengthMultiplier` | ignored | An fcose setting (D328): v13 lays architecture out with the `compass` grid engine (D326), which is deterministic and has no solver to tune. | none |
| `architecture.edgeElasticity` | ignored | An fcose setting (D328): v13 lays architecture out with the `compass` grid engine (D326), which is deterministic and has no solver to tune. | none |
| `architecture.numIter` | ignored | An fcose setting (D328): v13 lays architecture out with the `compass` grid engine (D326), which is deterministic and has no solver to tune. | none |
| `architecture.seed` | ignored | An fcose setting (D328): v13 lays architecture out with the `compass` grid engine (D326), which is deterministic and has no solver to tune. | none |
| `mindmap.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the mindmap renderer never did. |  |
| `mindmap.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `mindmap.layoutAlgorithm` | ignored | v12 never read it. Mindmap lays out with core's `tree` engine (D284); `mindmap.layout` or the top-level `layout` chooses another engine, and `cose-bilkent` and `tidy-tree` there map to `tree`. | `mindmap.layout` or `layout` |
| `ishikawa.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the ishikawa renderer never did. |  |
| `ishikawa.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `treemap.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the treemap renderer never did. |  |
| `treemap.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `treemap.borderWidth` | ignored | v12 set a default and never read it. |  |
| `treemap.valueFontSize` | ignored | v12 set a default and never read it: values are fitted to their box from the treemap's own sizes, as in v12. |  |
| `treemap.labelFontSize` | ignored | v12 set a default and never read it: labels are fitted to their box from the treemap's own sizes, as in v12. |  |
| `kanban.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the kanban renderer never did. |  |
| `kanban.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `gitGraph.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the gitGraph renderer never did. |  |
| `gitGraph.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `gitGraph.nodeLabel` | ignored | v12's gitGraph never read it. |  |
| `gitGraph.nodeLabel.width` | ignored | v12's gitGraph never read `nodeLabel`. |  |
| `gitGraph.nodeLabel.height` | ignored | v12's gitGraph never read `nodeLabel`. |  |
| `gitGraph.nodeLabel.x` | ignored | v12's gitGraph never read `nodeLabel`. |  |
| `gitGraph.nodeLabel.y` | ignored | v12's gitGraph never read `nodeLabel`. |  |
| `gitGraph.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `c4.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the C4 renderer never did. |  |
| `c4.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `c4.layout` | ignored | C4 lays out with its own grid and relation router (`layoutKind: 'custom'`, D454, D455), as v12 had its own packer; neither the top-level nor a C4-scoped `layout` changes it. |  |
| `c4.height` | ignored | v12's C4 renderer never read it: an element is as tall as its text (D454). |  |
| `c4.boxMargin` | ignored | v12's C4 renderer never read it (D454). |  |
| `c4.wrapPadding` | ignored | v12's C4 renderer never read it (D454). |  |
| `c4beta.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the C4 renderer never did. |  |
| `c4beta.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `c4beta.layout` | ignored | c4-beta lays out with core's `layered` engine, called directly (`layoutKind: 'custom'`); neither the top-level nor a c4-beta-scoped `layout` changes it. |  |
| `sankey.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the sankey renderer never did. |  |
| `sankey.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `packet.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the packet renderer never did. |  |
| `packet.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `block.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the block renderer never did. |  |
| `block.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `block.layout` | ignored | Block lays out with its own column grid (`layoutKind: 'custom'`), as v12; neither the top-level nor a block-scoped `layout` changes it. |  |
| `eventmodeling.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the event modeling renderer never did. |  |
| `eventmodeling.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `eventmodeling.rowHeight` | ignored | v12's event modeling renderer never read it: each lane is as tall as its tallest box, as in v12. |  |
| `treeView.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the treeView renderer never did. |  |
| `treeView.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `radar.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the radar renderer never did. |  |
| `radar.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `usecase.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the usecase renderer never did. |  |
| `usecase.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `venn.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the venn renderer never did. |  |
| `venn.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `wardley-beta.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the Wardley renderer never did. |  |
| `wardley-beta.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `cynefin.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the cynefin renderer never did. |  |
| `cynefin.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `railroad.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the railroad renderer never did. |  |
| `railroad.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `railroad.compactMode` | ignored | v12 read it and drew nothing different (D515). |  |
| `railroad.commentFill` | ignored | v12 read it into a style rule for `.railroad-comment`, which matched nothing: no comment element is drawn (D515). |  |
| `railroad.commentStroke` | ignored | v12 read it into a style rule for `.railroad-comment`, which matched nothing: no comment element is drawn (D515). |  |
| `railroad.commentTextColor` | ignored | v12 read it into a style rule for `.railroad-comment`, which matched nothing: no comment element is drawn (D515). |  |
| `railroad.showMarkers` | ignored | v12 read it and drew the start and end markers either way (D515). |  |
| `dompurifyConfig` | removed | v13 has no HTML sanitizer: output is safe by construction (R-SEC-1). | none |

### Changed defaults

| Key | v13 default | Reason |
| --- | --- | --- |
| `theme` | `"redux-color"` | The default changes from `default` to `redux-color`, the theme v12's flowchart renders by default (D151, amending D55). 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes, plus `default`, `dark`, `forest`, `neutral`, `base`, `neo` (v12 `theme-neo.js`, D180, D181) and `neo-dark` (v12 `theme-neo-dark.js`, cleaned up into a dark theme, D183). `null` renders `base`, with a `THEME_UNAVAILABLE` warning. |
| `layout` | `"layered"` | The default changes from `elk` to `layered`, the built-in engine (DESIGN §6.1). The v12 value `dagre` stays valid and maps to `layered` silently. `elk` and `elk.<algorithm>` (and the `flowchart-elk` header) are laid out by `@mermaid-js/layout-elk` once it is registered; without it they draw with `layered` and add one `ELK_NOT_INSTALLED` warning (D173). Other engines come in through `registerLayoutLoaders` (R-LAYOUT-2), and an unknown name falls back to `layered` with a `LAYOUT_UNKNOWN` warning. A diagram can name its own default engine (D284): mindmap lays out with `tree` (D280, loaded lazily) when no config layer sets `layout`, maps v12's `cose-bilkent` and `tidy-tree` to it silently (D282), honours `layered`, `dagre` and an installed `elk.*`, and draws an unknown or uninstalled name with `tree` and the same warnings; other diagrams do not reach `tree` (D285). Text output (`format: 'ascii'`) always lays out with `layered` and the cell profile, plugin or not: any other name gives one `ASCII_DROPPED` warning (`feature: 'layout'`) and nothing else, and its engine is never loaded (D179). |
| `maxEdges` | `5000` | The default changes from 500 to 5,000 (D31): one `A & … --> B & …` line multiplies edges, and v13 draws 5,000 quickly. Integrator-only; it sets the `maxEdges` render limit (R-SEC-5); an explicit `limits.maxEdges` wins. Over the limit, render() rejects with a `LIMIT` error. |
| `securityLevel` | `"default"` | The default changes from `strict` to the new level `default` (D48, D75), which keeps v12's absolute `http`/`https`/`mailto` links; `strict` now keeps relative links only, so an integrator who set `strict` explicitly loses absolute links (set `default` to keep them). `loose` turns on click callbacks (D554) and acts as `default` for link URLs, with no warning (D634); `antiscript` and `sandbox` act as `default` with a warning. |
| `flowchart.curve` |  | The default changes from `basis` to `rounded`, the look of v12's default ELK layout: stepped routes whose corners are arcs of radius 5 (less on a short leg). Set `basis` to keep S-curves. `linear` draws straight segments; `step`, `stepBefore` and `stepAfter` draw stepped routes with right-angle corners (the step in the middle, near the start and near the end of the leg); `rounded` draws straight segments with rounded corners; every other value draws S-curves (the layout engine routes edges, not a d3 curve factory). A name outside this list is drawn with the default, `rounded`, and warns `CURVE_UNKNOWN` once per render (D602, D681); v12 drew it as `basis`. The default lives in code, not in the schema (D733), so the resolved config shows no `flowchart.curve` unless it is set, and the top-level `curve` applies where it is not. |
| `sequence.actorFontSize` |  | The default changes: unset, it is the top-level `fontSize` when that is set (D620), else the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.actorFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.noteFontSize` |  | The default changes: unset, it is the top-level `fontSize` when that is set (D620), else the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.noteFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.messageFontSize` |  | The default changes: unset, it is the top-level `fontSize` when that is set (D620), else the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.messageFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `journey.taskFontSize` |  | The default changes: unset, task and section names are drawn in the theme's `fontSize` (16 by default), as for every diagram type, not v12's 14. A set value takes effect. |
| `journey.taskFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect. |
| `journey.sectionColours` |  | The default changes: unset, section and task names are `textColor`. When set, it colours them by section band (D225); v12's `['#fff']` reached only the `tspan` fallback, which its default `fo` labels did not show. |
| `journey.titleFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type (D248). A set value takes effect. |
| `class.padding` | `12` | The documented default changes from 5 to 12, the padding v12 drew class boxes with (D125): its schema said 5 but its renderer never got it. Unset, namespaces keep v12's 16 and notes its 6; set, the value pads all three. |
| `class.diagramPadding` | `8` | The documented default changes from 20 to 8, the padding v12 drew class diagrams with (D125): its renderer ignored the key and used 8. |
| `ishikawa.useMaxWidth` | `true` | The documented default changes from `false` to `true`, the value v12's renderer drew with (its runtime config gave `true`). True draws `width="100%"` and a `max-width`; false draws the diagram's own `width` and `height`. |
| `c4.personFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_personFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.systemFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_systemFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.system_dbFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_system_dbFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.system_queueFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_system_queueFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.boundaryFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.messageFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.containerFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_containerFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.container_dbFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_container_dbFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.container_queueFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_container_queueFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.componentFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_componentFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.component_dbFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_component_dbFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.component_queueFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `c4.external_component_queueFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect; one the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning. |
| `usecase.actorFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type (D132), not v12's `"Open Sans", sans-serif`. A set value takes effect; one the style check refuses draws in the theme's font and adds one `USECASE_CONFIG_IGNORED` warning. |
| `usecase.usecaseFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type (D132), not v12's `"Open Sans", sans-serif`. A set value takes effect; one the style check refuses draws in the theme's font and adds one `USECASE_CONFIG_IGNORED` warning. |
| `venn.padding` | `15` | The documented default changes from 8 to 15, the padding v12 drew its circles with (D412): v12 solved the layout twice, its circles at 15 and its text nodes and hand-drawn circles at `padding` (8), so text sat on circles of another size. v13 solves once, at an author's `padding`, else 15. A negative or non-numeric value lays out at 15, and one that leaves no room at 0, with no warning. |
| `railroad.fontSize` |  | The documented default changes from 14 to none (D515): unset, the theme's `fontSize` is used, as v12 drew (its runtime config reset the 14), so fonts stay uniform across diagrams. A number, or a string read with `parseFloat`, from 0 up to 10000; anything else is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently (and drew 10000 or more). |
| `railroad.fontFamily` |  | The documented default changes from `monospace` to none (D515): unset, the theme's `fontFamily` is used, as v12 drew (its runtime config reset `monospace`), so fonts stay uniform across diagrams. A value that fails core's style check is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.terminalFill` |  | The documented default changes from `#FFFFC0` to none (D515): unset, the theme's `railroadTerminalFill` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.terminalStroke` |  | The documented default changes from `#000000` to none (D515): unset, the theme's `railroadTerminalStroke` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.terminalTextColor` |  | The documented default changes from `#000000` to none (D515): unset, the theme's `railroadTerminalTextColor` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.nonTerminalFill` |  | The documented default changes from `#FFFFFF` to none (D515): unset, the theme's `railroadNonTerminalFill` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.nonTerminalStroke` |  | The documented default changes from `#000000` to none (D515): unset, the theme's `railroadNonTerminalStroke` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.nonTerminalTextColor` |  | The documented default changes from `#000000` to none (D515): unset, the theme's `railroadNonTerminalTextColor` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.lineColor` |  | The documented default changes from `#000000` to none (D515): unset, the theme's `railroadLineColor` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.markerFill` |  | The documented default changes from `#000000` to none (D515): unset, the theme's `railroadMarkerFill` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.specialFill` |  | The documented default changes from `#F0E0FF` to none (D515): unset, the theme's `railroadSpecialFill` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.specialStroke` |  | The documented default changes from `#8800CC` to none (D515): unset, the theme's `railroadSpecialStroke` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `railroad.ruleNameColor` |  | The documented default changes from `#000066` to none (D515): unset, the theme's `railroadRuleNameColor` is drawn, as v12 drew (its runtime config reset the default). Set, it beats the theme variable (D516); a value that is not a colour core accepts is dropped with one `RAILROAD_CONFIG_INVALID` warning, where v12 fell back silently. |
| `fontSize` |  | The documented default changes from 16 to none (D620), so a diagram can tell "not set" from 16: the resolved config (`CORE_DEFAULTS`, `prepare().config`) no longer holds `fontSize` unless a layer sets it. Read by sequence and timeline only, as in v12. Sequence: a set value sizes actor, message and note text where the `sequence.*FontSize` key is unset, and wins over `themeVariables.fontSize`; a CSS length such as `24px` works as for the per-key keys; the title stays at the theme's size. Timeline, as v12's renderer read it, with 16 when unset: each box is `fontSize × 0.55` px taller than its text, and the TD axis starts `2 × fontSize` above the content and ends `0.5 × fontSize + 20` below it; its text is drawn at `themeVariables.fontSize`. |

<!-- END GENERATED CONFIG SECTION -->

## Config behaviour

The v12 schema is kept (R-CONF-1): a v12 config object is a valid v13 config object, and keys of
diagram types that are not ported yet are accepted silently and take effect once their type is
ported (status `pending`, R-CONF-5).

- **Precedence is v12's**: defaults, then the diagram's own defaults, `initialize()`, front
  matter, then `%%{init}%%` directives in source order. Arrays merge as a union, and `null` or
  `undefined` never override.
- **Config is frozen.** The resolved config is deep-frozen and shared; there is no
  `getConfig()`/`setConfig()` to change it during a render (D72).
- **Diagram text is checked.** In front matter and directives, keys in `secure`, the
  integrator-only options, unknown keys and removed keys are dropped with a warning
  (`CONFIG_SECURE_KEY`, `CONFIG_UNKNOWN_KEY`, `CONFIG_REMOVED_KEY`, `CONFIG_MOVED_KEY`). v12
  kept unknown keys. Values v12 considered unsafe (containing `<` or `>`, `url(data:`, theme
  variables outside v12's character set, unbalanced CSS in font keys) are dropped with
  `CONFIG_UNSAFE_VALUE`. `__proto__`, `constructor` and `prototype` keys are skipped from every
  source. `initialize()` keeps unknown keys but still warns.
- **Warnings, not logs.** Every config warning is in `RenderResult.warnings` (and
  `parse()`'s `warnings`) with a `code` and a `path`.
- **Config lengths are numbers.** A length key in the `class`, `er`, `state` and `flowchart`
  sections (`padding`, `nodeSpacing`, `rankSpacing`, `diagramPadding`, `wrappingWidth`,
  `minNodeWidth`, `minEntityWidth`, `entityPadding`) takes a number, or a whole numeric string
  as its number (`"20"`, `" 2.5 "`), from 0 up to 10000. Earlier v13 alphas read `"20px"` as 20
  without a warning; v13 now lays anything else (`"20px"`, `-5`, `true`) out as if the key were unset, with one
  `CLASS_CONFIG_IGNORED`, `ER_CONFIG_IGNORED`, `STATE_CONFIG_IGNORED` or
  `FLOWCHART_CONFIG_IGNORED` warning naming the key, as the other ported types do.
- **An init `config` key** is moved into the detected diagram's section, as in v12
  (`%%{init: {"config": {"curve": "linear"}}}%%` in a flowchart sets `flowchart.curve`).
- **`fontFamily`** from `initialize()` or diagram text also sets `themeVariables.fontFamily`,
  as in v12.

Removed and ignored keys, with what to use instead:

- `htmlLabels`, `flowchart.htmlLabels`, `class.htmlLabels`: removed from core, which always draws
  labels as SVG text (D5); markdown strings cover bold, italic, code and lists
  ([Labels](#labels-and-text)). With `@mermaid-js/plugin-html-labels` registered they set its
  `html.labels` key instead ([HTML labels](#html-labels)).
- `dompurifyConfig`: removed. There is no HTML sanitizer to configure; the SVG writer only
  emits allow-listed elements and attributes, and `assertInert` checks the output (R-SEC-1).
- `themeCSS`: removed, with a `CONFIG_REMOVED_KEY` warning. The output carries no author stylesheet (R-SEC-2). Use `themeVariables`,
  `classDef`, or CSS on the host page (`--mermaid-*` variables and the kept class names).
- `logLevel`: ignored. Nothing is logged; read `RenderResult.warnings`.
- `altFontFamily`: ignored; no v12 renderer used it either.
- `arrowMarkerAbsolute` (top level and in every diagram section): ignored. Arrowheads are
  inline paths, so there are no `url(#…)` marker references to make absolute.
- `deterministicIds` and `deterministicIDSeed` are pending but have nothing to do in a
  flowchart: v13 writes no generated ids, and the output is byte-identical for the same input
  and config when the measurer is deterministic.

Sequence diagrams (`sequence` section, #145):

- **Per-key font sizes take effect.** v12 replaced `sequence.actorFontSize`, `noteFontSize` and
  `messageFontSize` with the global `fontSize` before drawing, so setting them did nothing and
  every label was drawn at 16 px. v13 draws a set value; unset, they follow the theme's
  `fontSize` (D132). A diagram that sets none looks as before in a 16 px theme; under the redux
  family, `neo` and `neo-dark` (`fontSize` 14px) its text is 14 px where v12 drew 16 px.
  The documented defaults 14 and 16 are gone.
- **A top-level `fontSize` that the author sets scales actor, message and note text** (D620),
  as v12 drew it. A set per-key size still wins over it, where v12 let the top-level key
  replace the per-key one; the top-level key wins over `themeVariables.fontSize`. The title
  stays at the theme's size, as in v12. The top-level key no longer has a default of 16, so
  the resolved config holds it only when a config layer sets it.
- **Per-key font families follow the Mermaid font** when unset (`fontFamily`), as every
  diagram type's text does; a set `actorFontFamily`, `noteFontFamily` or `messageFontFamily`
  takes effect after the same safety check as other font keys.
- `messageMargin` (never read by v12's renderer) and the `actorFont`, `noteFont`,
  `messageFont` helpers are ignored. `sequence.forceMenus` is honoured: the actor menus are
  drawn by `@mermaid-js/plugin-interactions`, which shows every menu when it is set; without
  the plugin there are no menus to show.

## Themes

| v12 | v13 | Why |
| --- | --- | --- |
| Default theme `default` (the flowchart section defaults to `redux-color` with `look: neo`) | Default theme `redux-color` for every diagram type, with v12's `look: neo` geometry. Set `theme: 'default'` for v12's default colours and classic geometry | D151 |
| Themes `default`, `base`, `dark`, `forest`, `neutral`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color`, `redux-dark-color`, `null` | 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes ported from v12, plus `default`, `dark`, `forest`, `neutral`, `base`, `neo` and `neo-dark`. `neo` is v12's `theme-neo.js` with v12's `look: neo` geometry (the redux family's), corner radius 3, its blurred shadow and no per-subgraph palette. `neo-dark` is v12's `theme-neo-dark.js` with the same geometry and tokens, cleaned up into a dark theme ([neo-dark](#neo-dark)). `null` renders `base`, with a `THEME_UNAVAILABLE` warning. An unknown name renders the default theme with the same warning | D151, D180, D181, D183, R-THEME-6, R-THEME-7 |
| — | `theme: 'auto'`: the default theme, switching to `dark` under `prefers-color-scheme: dark` through a small custom-property `<style>` | R-THEME-8 |
| Colours computed once in JS (khroma) and written into a `<style>` element | Colours are presentation attributes reading CSS variables: every theme variable is `--mermaid-<name>` on the host page, with the theme value as fallback; derived colours use `color-mix()`, and contrast text and `invert()` use relative colour syntax (`color(from …)`), so they follow a host override of the colour they derive from. A page can re-theme rendered SVGs with CSS. Limit: contrast text picks between the theme's two ink values; overriding the ink variables themselves (`--mermaid-textColor`) does not change contrast-derived text such as `nodeTextColor` (set `--mermaid-nodeTextColor` directly) `initialize({ output: { cssVariables: false } })` writes literal colours instead | R-THEME-2, R-THEME-3, R-THEME-4 |
| `themeVariables` from diagram text checked against a character set only | Values are checked by kind (colour, length, font, weight) and a bad one, a misspelt colour included (`mainBkg: redd`), is dropped with `THEME_VARIABLE_DROPPED` and the theme's value kept. Names v13 does not use are ignored | R-SEC-3, D690 |
| A malformed colour function (`rgb(redd)`, `hsl(1 2)`, `color(srgb redd)`, `color-mix(in srgb, redd, blue)`, `light-dark(redd, blue)`): a theme variable such as `primaryColor: "rgb(redd)"` threw `Unsupported color format`; a sequence `rect`, journey or legacy C4 colour went into an attribute such as `fill="rgb(redd)"`, which browsers drew black | A colour function's arguments are checked wherever an author gives a colour: the channels of `rgb()`, `hsl()`, `oklch()` and the like, the colour space and channels of `color()`, and the two colours of `color-mix()` and `light-dark()`. A malformed one is dropped with the path's warning (`THEME_VARIABLE_DROPPED`, `STYLE_VALUE_DROPPED`, …), and the theme or default colour is drawn. Valid CSS the check does not read is refused the same way: relative colours (`rgb(from red r g b)`), `var()` or `calc()` inside a channel function, and exponents (`1e2`). Write the colour out instead | D690, D737 |
| Nested `themeVariables` sections (`themeVariables.packet.startByteColor`), read by v12 packet, radar, cynefin, wardley and xychart | Each nested key maps onto one flat theme variable of the diagram (`packetStartByteColor`), listed beside it in the [theme variable inventory](theme-variables.md); the flat name is the CSS variable's. When both are set, the flat name wins, with no warning. An unknown nested key is ignored | D335, D540 |
| A plugin's config fragment declaring a theme variable | Unchanged (colour-only, global), but when a diagram's own theme table defines the same name, the diagram's table wins in that diagram's renders | D336, D337 |
| `themeCSS` | Removed, with a warning; see [Config behaviour](#config-behaviour) | R-SEC-2 |
| Label text colour fixed by the theme | When a `style`/`classDef` fill makes the theme's text colour unreadable (below WCAG AA), the text switches to black or white, whichever reads better. This holds for node labels and for subgraph titles. A `color` the author sets wins. Under `look: handDrawn` the text is still judged against the fill colour, although the hachure lets some background show through | R-THEME-12, D21, D688 |
| A comma inside a `style`, `classDef` or `linkStyle` value: the statement was split at every comma and the pieces joined with `;`, so `fill:rgb(255, 200, 200)` lost its colour and `font-family:Georgia, serif` kept only `Georgia`, without a warning | The pieces of a value with an open parenthesis (`rgb(`, `hsl(`, `var(`) or of a `font-family` list are joined back, so the whole value is kept, in every type. Syntax is unchanged: flowchart's `style` still takes no parentheses, as in v12 | D706, #1312 |
| `look: neo` / `look: classic` | `look` is removed: the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. What `look` switched in v12 is theme data: the redux themes, `neo` and `neo-dark` carry v12's neo geometry and the classic themes (`default`, `dark`, `forest`, `neutral`, `base`) carry v12's classic geometry. For a mix, override the variables ([Theme geometry](#theme-geometry)) | D152, D153 |
| `look: handDrawn` | Drawn by the optional `@mermaid-js/plugin-hand-drawn`, whose config fragment takes `look: handDrawn` as an alias of its `handDrawn` key. Without the plugin it is ignored like any other `look`, with one `LOOK_REMOVED` warning that names the plugin. See [Hand-drawn look](#hand-drawn-look) | D7, D153, D300, D303, R-PLUG-8 |
| Neo gradients (`useGradient`, `gradientStart`, `gradientStop`) | Public theme variables. `neo` and `neo-dark` turn the gradient on (`#0042eb` to `#eb0042`, left to right); every other theme has it off, and any theme can turn it on in `themeVariables`. The SVG then carries one `<defs>` with a `<linearGradient id="<idPrefix>-gradient">`, and the outlines v12 neo strokes with the gradient take `url(#<idPrefix>-gradient)`, so two diagrams on a page never share it. The stops read `--mermaid-gradientStart` / `--mermaid-gradientStop`. See [Neo gradient](#neo-gradient) | D182, R-THEME-7 |
| Drop shadow under `look: neo` | A hard drop shadow in the redux themes, as the CSS `filter` from the `dropShadow` theme variable: offset 4px, no blur, 6% opacity, black on light themes and white on dark. `neo` keeps v12's blurred shadow, `drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))`, and `neo-dark` its own, `drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))`. It is on node outlines, icons, subgraphs and collapsed groups, not on edges, edge labels or swimlanes. Under `neo` and `neo-dark`, sequence participants take the theme's drop shadow, as notes and fragment labels do; v12 drew them with a separate 6% white offset filter that did not show on `neo` (D184). The classic themes set `dropShadow: none`. No `<defs>` and no ids, so several diagrams on a page never collide | D151, D152, D181, D184 |
| Per-subgraph colour in `redux-color` | Each subgraph takes a palette slot by declaration order, cycling after twelve: border from `borderColorArray`, fill from `bkgColorArray`. `redux-dark-color` has an empty fill palette, so its subgraphs are coloured on the border only. `redux` and the classic themes carry no palette. Colour is on whenever the theme has a non-empty `borderColorArray` (a `themeVariables` palette turns it on in any theme), and a collapsed subgraph's card, separator and dots take its slot too. As in v12 the slot is written as `data-color-id="color-<n>"` on the cluster or collapsed node, and an author `style` / `classDef` still wins. Swimlanes are not drawn yet, so there is nothing to colour there | D151, D152 |
| Sequence colours `actorBkg`, `actorBorder`, `actorTextColor`, `actorLineColor`, `signalColor`, `signalTextColor`, `labelBoxBkgColor`, `labelBoxBorderColor`, `labelTextColor`, `loopTextColor`, `activationBkgColor`, `activationBorderColor`, `sequenceNumberColor`, `rectBkgColor` | The same names, derived as v12 `theme-base.js` derives them, with each built-in theme's v12 values pinned where they differ; `--mermaid-<name>` like every variable. `activationBorderColor` is `secondaryColor` with 12.5% black, close to khroma's `darken(…, 10)` | R-THEME-2, D71 |
| Numbered palettes (`pie*`) | `pie1`–`pie12` and the other pie variables are in the inventory ([Pie chart](#pie-chart)). | R-CONF-5 |
| `git0`–`git7`, `gitInv0`–`gitInv7`, `gitBranchLabel0`–`gitBranchLabel7`, `commitLabelColor`, `commitLabelBackground`, `commitLabelFontSize`, `tagLabelColor`, `tagLabelBackground`, `tagLabelBorder`, `tagBorder`, `tagLabelFontSize` | The same names with v12's values in every theme. `git`, `gitInv` and `gitBranchLabel` are palettes of eight slots: a numbered name replaces one slot and `git: [...]` (or a comma-separated string) the whole list. They follow `primaryColor`, `secondaryColor` and `tertiaryColor` where v12's theme does (`base`, `forest`, `redux-dark`, `redux-dark-color`; `cScale2`–`cScale8` in `dark` and `neutral`, which v12 read as `pie2`–`pie8`, so an author's `cScale<n>` moves them and `pie<n>` does not, D334), the lighter step under `darkMode`, and a `gitInv` slot follows an author's `git<n>` where v12's does. `tagLabelBorder` wins over `tagBorder`, as in v12. v12's `branchLabelColor` is not read: set `gitBranchLabel`. Where v12's branch labels read `labelTextColor` they read the shared label ink `scaleLabelColor` (D334), so an author's `labelTextColor` no longer reaches them. In `base`, `tagLabelBorder` takes v13's `primaryBorderColor` (v12's border step changes saturation, which the derivation DSL has none of), and under `darkMode` `base`, `neo`, `redux` and `redux-color` keep their tag text colour where v12 turned it to `#eee`. A gitGraph with nine or more branches reuses the slots from the ninth on: every part of a branch (bullets, line, arrows, label) takes the same slot, where v12's redux themes cycled the labels over twelve | D267 |
| `cScale0`–`cScale11`, `cScaleInv0`–`cScaleInv11`, `cScaleLabel0`–`cScaleLabel11` | Three palettes, `cScale`, `cScaleInv` and `cScaleLabel`, with v12's values in every theme, derived as v12 derives them: they follow `primaryColor` (and the secondary and tertiary colours) where v12's theme does (`base`, `forest`, `dark` slot 0, `neo-dark`, `redux-dark`; `mainBkg` in `redux`), the darker steps under `darkMode`, and an override of one slot or of the whole list (`cScale: [...]`). A `cScaleInv` or `cScaleLabel` slot that v12 derived from the `cScale` slot follows its override as in v12. `THEME_COLOR_LIMIT` is ignored: twelve slots, cycling. The labels read v12's `scaleLabelColor`, a shared label ink, so setting it recolours them as in v12; `labelTextColor` and `actorTextColor` are sequence's own and no longer reach `cScaleLabel` (D334), so set `scaleLabelColor` or `cScaleLabel` instead. Under `darkMode`, v12 also turned the unset text colour of `base`, `neo`, `redux` and `redux-color` to `#eee`, which their labels followed; v13 keeps the theme's `scaleLabelColor`. The timeline paints with them only in the classic themes, and with `cScaleLabel` in the neo themes ([Timeline config](#timeline-config)) | D258, D334 |
| `cScaleLabel` in `redux-dark` | v12's `#e0dfdf` where it reads on the slot's fill (4.5:1), else black where black reads better. With the theme's own values only slot 8 changes: its light grey `#c0bfbe` fill had `#e0dfdf` text at 1.38:1, and now has black at 11.44:1. Every other slot keeps `#e0dfdf` on black (15.79:1), and under `darkMode` (slot 8 `#41403f`) nothing changes. The rule also applies to an author's `scaleLabelColor` or `cScale<n>`: an ink that fails on its fill turns black when black reads better. An author's `cScaleLabel<n>` is drawn as given. The fills keep v12's values (D258). `neo-dark` keeps v12's labels: its mindmap and timeline draw them on `mainBkg` under the gradient, not on the `cScale` fill | D544 |
| `base` derives `secondaryColor` and `tertiaryColor` from `primaryColor`, and `lineColor` from `background`, unless the author sets them | The same rules, written as CSS over `--mermaid-primaryColor` and `--mermaid-background`, so a host page's override of either moves them too. Errors are drawn in `tertiaryColor` with `tertiaryTextColor`, and notes stay `#fff5ad` with `#333333` text under `darkMode` and a `primaryTextColor` override, as in v12 | D569 |
| `default`, `dark`, `forest` and `neutral` set `mainBkg`, their borders, some text inks, the notes and the errors as constructor literals, which an override of a base colour does not move | The same literals (`mainBkg` `#ececff`, `#1f2020`, `#cde498`, `#eeeeee`), so `primaryColor` in `themeVariables` does not repaint their nodes. On a host page `--mermaid-primaryColor` does not either: set `--mermaid-mainBkg` (and `--mermaid-nodeBorder` for the outlines). `dark`'s note and cluster fill follow an author's `mainBkg`, lightened by 16, as v12's `secondBkg`. `base` still derives `mainBkg` from `primaryColor` | D570, R-THEME-3 |
| `arrowheadColor` in `getThemeVariables()`: `#333333` in `default`, `#d3d3d3` in `dark`, `invert(background)` in `base`, `#008000` in `forest`, `#333333` in `neutral`; the drawn arrowheads took `lineColor` (`.marker`) | Arrowheads are painted `arrowheadColor`, which follows `lineColor` in every built-in theme, so an author's or host's `lineColor` recolours edges and heads together, as v12 drew them: `forest`'s heads are `#000000` and `neutral`'s `#666666`, like their lines. Set `arrowheadColor` for heads of their own colour | D575, D680 |
| `forest`: an author's `mainBkg` moved the sequence participant border and the lifeline (`darken(mainBkg, 20)`) | Both stay `#a6cf47`: set `actorBorder` (and `actorLineColor` for the lifeline) | D576 |
| `darkMode: true` turned `base`'s text (`primaryTextColor`, `textColor`, `nodeTextColor`, `scaleLabelColor`) to `#eee`, and `dark`'s and `neutral`'s `scaleLabelColor` to black | `darkMode` switches only the derivation rules; every theme keeps its own text colours (`#333333` in `base`, whose fills stay light; `#d3d3d3` and `#333333` scale labels in `dark` and `neutral`). Set the text variables in `themeVariables` for v12's. Derived fills take the dark rule under `darkMode` too, where v12 kept a value its theme set before `darkMode` applied: ER's `rowOdd` (`forest`, `base`) and gantt's `doneTaskBkgColor` (`default`, `forest`, `neutral`, `base`); set them in `themeVariables` for v12's | D571 |
| `dark`: edge label fill `#585858` under `#ccc` text (4.43:1), note and secondary text `#b8b6b6` on `#474949` (4.49:1); `base` with a dark `primaryColor` or `mainBkg`: node text stays `#333` | WCAG AA: `dark`'s edge label fill is its background (D628), its note text `#cccccc` and secondary text `#e0dfdf`; under `base` node text turns light (`#f4f4f4`) on a dark `primaryColor` or `mainBkg` | D29, R-THEME-9 |
| Edge label fill `edgeLabelBackground`: `#e8e8e8cc` (80% alpha) in `default`, `#585858` in `dark`, `#e8e8e8` in `forest`, `#ffffff` in `neutral`, `secondaryColor` elsewhere; ER `tertiaryColor` at half opacity in the classic themes, white or `#16141f` in the redux colour themes; class `mainBkg` | Every edge label is a rounded tag with a 1 px border in its edge's colour, filled opaque with the theme's `background` in every theme, for `edgeLabelBackground`, `erEdgeLabelBackground` and class's labels. Set `edgeLabelBackground` (or `erEdgeLabelBackground` for ER) in `themeVariables` for another fill | D626, D627, D628 |
| `base`'s borders from khroma's `mkBorder` (saturation −40, lightness −10; +10 under `darkMode`), and its text on secondary and tertiary fills, titles and errors from `invert()` of the fill | Borders mix 15% black into their fill (20% white under `darkMode`): `nodeBorder`, `clusterBorder`, `actorBorder`, `noteBorderColor`, `border2`, the three `*BorderColor` and the gradient stops. `secondaryTextColor`, `tertiaryTextColor`, `titleColor` and `errorTextColor` pick `primaryTextColor` or `background` by contrast. Close to v12, not equal | D71 |

Colours are close to, but not byte-equal with, v12. Where a v12 colour pair failed WCAG AA
contrast, v13 changes it (for example the dark theme's note text).

### Theme geometry

Every difference between the redux and classic theme families is a theme variable (D152); no
renderer checks a theme name or a look. v12 is the reference for every value, with the two
exceptions marked below. Override any of them in `themeVariables`, for example
`arrowheadGap: 0` on `redux-color`, or the redux padding values on `default`. Geometry
variables feed layout, so they are read as numbers at render time and overriding their
`--mermaid-*` CSS variables has no effect; `dropShadow` is a CSS value. "padding" is
`flowchart.padding` (default 15), which the classic themes now honour.

| Variable | Redux family, `neo` and `neo-dark` (v12 neo) | Classic family (v12 classic) |
| --- | --- | --- |
| `borderColorArray` | Tailwind-400 × 12 (`redux-color`, `redux-dark-color`) | none |
| `bkgColorArray` | Tailwind-50 × 12 (`redux-color`); empty (`redux-dark-color`) | none |
| `arrowheadGap` (point) | 4 | 0 |
| `arrowheadLength` / `arrowheadWidth` (point) | 10.5 / ≈12.8 | 8 / 8 |
| `circleArrowheadSize` / `circleArrowheadGap` | 14 / ≈3.15 | 11 / ≈1.1 |
| `crossArrowheadSize` / `crossArrowheadGap` / `crossArrowheadStrokeWidth` | 10.4 / ≈2.96 / 2 | 9 / ≈2 / 2 |
| `nodePaddingX` / `nodePaddingY` (per side) | 16 / 12 | 2 × padding / padding (30 / 15 at the default) |
| `stadiumPaddingX` / `stadiumPaddingY` (totals) | 40 / 24 | padding |
| `hexagonPaddingX` / `hexagonPaddingY`; `hexagonSlant` | 70 / 32; 3.5 | padding; 4 |
| `doubleCircleGap` / `doubleCirclePadding` | 12 / 16 | 5 / padding |
| `circlePadding` / `circleMinDiameter` | 16 / 44 (v13's earlier values, kept) | padding / none |
| `subroutinePaddingX` / `subroutinePaddingY` (totals, inside the 8px frames) | 28 / 12 | padding |
| `cylinderPaddingX` / `cylinderPaddingY` (totals, besides the caps) | 24 / 24 | padding |
| `leanPaddingX` / `leanPaddingY` (totals; per side for the inverted trapezoid) | 2 × padding / padding | padding |
| `oddPaddingX` / `oddPaddingY` (totals) | 42 / 24 | padding |
| `actorRadius` (sequence participant box corner) | 6 | 3 |
| `actorGlyphBand` (sequence: the band symbols stand in, scaled to it; above 0 turns on v12 neo's band model) | 44 | 0 (each symbol at its classic place) |
| `messageEndGap` (sequence: a message stops this far short of its target, past the head room; a bidirectional one starts this far in) | 3 | 0 |
| `labelBoxExtraHeight` (sequence: added to a fragment's label tab) | 15 | 0 |
| `actorFooterPadding` (sequence: room below a drawing with participants) | 30 | 0 |
| `timelineRadius` (timeline box top corners) | 0 (`neo`, `neo-dark`: 5, D227) | 5 |
| `timelineLabelOffset` (timeline: a section or period label below its box's top) | padding (`neo`, `neo-dark`: 0.5 × padding) | 0.5 × padding |
| `timelineEventLabelShift` (timeline: added to half the padding above an event label) | 3 (`neo`, `neo-dark`: 0) | 0 |
| `timelineScaleColors` (timeline boxes take `cScale<n>` fills, `cScaleLabel<n>` text and a 3px `cScaleInv<n>` rule; the axis and connectors `cScaleLabel11` at 4px / 2px) | `false`: `mainBkg` fill (the `borderColorArray` slot when `bkgColorArray` is non-empty, D257), `nodeBorder` outline at `strokeWidth` with `dropShadow`, `nodeBorder` text, axis and connectors at `strokeWidth` (`neo`, `neo-dark`: `true`, D227) | `true` |
| `mindmapRoundedNodes` (mindmap: a node written without a shape is drawn rounded, D288; with `mindmapOutlinedNodes` the root takes `mainBkg` and `nodeBorder` text, and without a `borderColorArray` every node takes `mainBkg` with a `nodeBorder` outline and text) | `true` (`neo`, `neo-dark`: `false`) | `false` |
| `mindmapOutlinedNodes` (mindmap: an outline at `strokeWidth` and `dropShadow`, flat-bottomed plain nodes, `cScaleLabel0` root text, edges `max(10 − 2d, 2)` px at depth class `d`) | `true` | `false`: no outline or shadow, four rounded corners, `gitBranchLabel0` root text, edges `14 − 3d` px (3 px from depth class 5) |
| `mindmapBorderEdges` (mindmap edges in `nodeBorder` rather than their section's `cScale<n>`; read with `mindmapOutlinedNodes`) | `true` (`neo`: `false`) | `false` |
| `gitCommitRadius` (gitGraph bullet radius; half a highlight square's side) | 7 (`neo`, `neo-dark`: 10, D266) | 10 |
| `gitLaneShift` (gitGraph LR: how far a branch's line and commits sit below 2 px above its lane, v12 classic's spot) | 9, so 7 below the lane (`neo`, `neo-dark`: 0) | 0 |
| `gitBranchLabelPaddingX` / `gitBranchLabelPaddingY` (gitGraph: room the branch label box adds) | 16 / 12 (`neo`, `neo-dark`: 0 / 0) | 0 / 0 |
| `gitBranchLabelRadius` (gitGraph branch label box corner) | 0 (`neo`, `neo-dark`: 4) | 4 |
| `gitBranchLabelShiftX` / `gitBranchLabelOffsetY` (gitGraph TB/BT: the branch label box moved left and away from the commits) | 11 / 22 (`neo`, `neo-dark`: 0 / 0) | 0 / 0 |
| `gitArrowWidth` (gitGraph arrows) | 2, v12's `strokeWidth`, which an author's `strokeWidth` no longer moves (`neo`, `neo-dark`: 8) | 8 |
| `gitHighlightInnerSize` / `gitMergeRadius` / `gitReverseCrossSize` / `gitCherryPickDotRadius` (gitGraph bullet insides: highlight square side, merge circle radius, half the reverse cross, cherry-pick dot radius) | 8 / 5 / 4 / 2.5 (`neo`, `neo-dark`: classic) | 12 / 6 / 5 / 2.75 |
| `gitNodeColors` (gitGraph: the first branch, the commit and tag labels and the bullet insides take `nodeBorder` / `mainBkg`, label boxes `mainBkg` with an outline, tags the shadow, branch lines a `4 2` dash and reverse crosses `strokeWidth`) | `true` (`neo`, `neo-dark` too) | `false`: the git label variables and `primaryColor`, a `2` dash and 3 px crosses |
| `gitPaletteColors` (gitGraph: the `git`, `gitInv` and `gitBranchLabel` palettes colour the branches; a non-empty `borderColorArray` colours them in every theme) | `false`: every branch in `nodeBorder` (`neo`, `neo-dark`: `true`) | `true` |
| `commitLineColor` (colour: gitGraph branch lines, v12's name) | `#BDBCCC` (`neo`, `neo-dark`: not set) | not set: the lines take `lineColor`, as v12's `commitLineColor ?? lineColor` (an author's value wins in every theme) |
| `dropShadow` | `drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))`; white instead of black on `redux-dark` and `redux-dark-color`; `drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))` on `neo`; `drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))` on `neo-dark` | `none` |
| `classText` (colour: class diagram text) | `textColor` | `primaryTextColor` |
| `classMarkerStrokeWidth` / `classFilledMarkerStrokeWidth` (outline of hollow / filled class markers) | 2 / 0 | 1 / 1 |
| `extensionMarkerLength` / `extensionMarkerGap` (inheritance triangle) | 8 / 8.25 | 17 / 0.25 |
| `compositionMarkerGap` / `dependencyMarkerGap` | 2.75 / 4 | 0.25 / 1 |
| `erZeroOrMoreCircleOffset` (ER, centre of a zero-or-more circle from the outline) | 28 | 30 |
| `rowOdd` / `rowEven` (ER attribute rows) | the entity fill (`mainBkg`): v12 neo leaves rows unfilled | v12's `rowOdd` / `rowEven`, the same colours (khroma's HSL lightening, D117) |
| `erMarkerFill` (ER zero circles) | `mainBkg`, as v12 neo's `zero_or_more_neo` and `zero_or_one_neo` | white under every override, as v12 `look: classic` draws it. v12 12.2 and 12.3 default to `look: neo`, which fills the circle with `mainBkg`; `themeVariables.erMarkerFill` brings that back (D152, D153) |
| `erRowOddTextColor` / `erRowEvenTextColor` (colour: ER attribute text, new in v13) | `nodeTextColor`: the rows show the entity fill, so the text keeps the header ink | the ink against each row's own fill: an author's `nodeTextColor` where it meets AA on the row, else `textColor`, else `background` where that reads better; in CSS the choice follows the row fill (D572) |
| `compositeBackground` (state) | `background`; `#16141f` on `redux-dark` and `redux-dark-color` | `background`; `default` keeps `#ffffff` under a `background` override, as v12 (D656) |
| `compositeTitleBackground` (state) | `#f9f9fb`; `#16141f` on `redux-dark` and `redux-dark-color`; `mainBkg` on `neo` and `neo-dark` | `mainBkg`; `default` keeps `#ececff` under a `mainBkg` override, as v12 (D656) |
| `altBackground` (state) | `#f9f9fb`; `#16141f` on `redux-dark` and `redux-dark-color`; `#f0f0f0` on `neo`; `#404040` on `neo-dark` (D189) | `#f0f0f0` (`default`, `forest`); `#555555` (`dark`); `#f4f4f4` (`neutral`); `tertiaryColor` (`base`) |

The palette rows apply to the two colour themes only; plain `redux`, `redux-dark`, `neo` and
`neo-dark` carry no per-subgraph palette (every theme carries `cScale`, `cScaleInv` and
`cScaleLabel`, D258). A padding variable (the `…Padding…` names) takes a px number or a multiple of
`flowchart.padding` written `padding` or `<n> * padding`, so `nodePaddingX: '2 * padding'`
gives a redux theme classic node padding. `circlePadding` is added to the label's diagonal,
so it counts twice towards the diameter compared with the per-side node padding.

- **Arrowheads** stop `arrowheadGap` short of the node outline, so in the redux themes a 4px gap
  separates the tip from the node, as in v12 neo. They stay inline paths with no `<marker>`;
  v12's `refX` and `stroke-dasharray` mechanism is not needed, and dashed and dotted edges look
  the same as in v12. Sizes are what v12 draws, not its marker boxes: a v12 cross does not fill
  its box, so `crossArrowheadSize` is the arm span (10.4 neo, 9 classic) and the neo stroke is
  v12's 2.5 scaled by the marker's 0.8.
- **Mindmap shapes take the same padding variables** as the flowchart's (spec #294 T4): a rectangle
  `nodePaddingX` / `nodePaddingY` of 10 (v12's renderer fixed it; 16 / 12 in the redux family), a
  circle `circlePadding` of `mindmap.padding` (16, with no minimum diameter), a hexagon
  `hexagonPaddingX` / `hexagonPaddingY` of `2 × mindmap.padding` and `hexagonSlant`. The rounded
  shape keeps 15 on each side with the theme's `radius` corner; the plain, cloud and bang shapes
  have no family difference.
- **Hexagon padding axes are corrected.** v12 adds the X padding to the height and the Y padding
  to the width; v13 applies X to the width and Y to the height, so a hexagon in a redux theme is
  wider and less tall than in v12 (D151).
- **Circle padding stays as in v13** in the redux themes (16, minimum diameter 44), instead of
  v12 neo's values, so circles do not grow (D151).
- **Per-shape padding.** As in v12, only the rectangle and the shapes drawn like it use
  `nodePaddingX` / `nodePaddingY`. The subroutine, cylinder, parallelogram and trapezoid, and
  asymmetric shapes have their own variables (v12's per-shape `labelPadding` values), and the
  rounded rectangle takes `padding` on each side in every theme, so it has none. The lined
  cylinder shares the cylinder's variables (v12 neo gives it 16 across instead of 24). The
  shapes keep v13's outlines (cap height, slant), so sizes are close to v12, not equal.
- **Diamonds** are the v12 square rhombus in every theme, with side = label width + label
  height + 2 × padding. Being the same everywhere, the diamond has no theme variable.
- **Person shapes** (`@{ shape: person }`) keep c4model.com's proportions, as v12's fix
  mermaid-js/mermaid#8322 does (#683): the head's radius is 0.23 × the body's width (16 to 80),
  the body is at least 0.6 × its width tall, and the label is centred on the part of the body
  the head does not cover. A one-line label no longer draws a small head on a flat bar. C4's
  persons follow the same rule.
- **Collapsed subgraphs** are drawn as in v12 in every theme: a rounded card, a dashed separator
  and three dots. The dots are flat: filled with the separator colour at 0.6 opacity, with no
  stroke and no shadow, which is what v12's stylesheet asks for. v12 neo draws them with a dark
  2px outline and a drop shadow only because a generic `.node circle` rule beats its own
  `.collapsed-indicator` rule on specificity (D154).
- **Layout room for arrowheads is fixed.** The layout leaves 7px for an arrowhead in a crossed
  gap whatever the arrowhead variables say, so changing `arrowheadLength` or the other
  arrowhead variables redraws the arrowheads but never moves a node (D154).

### neo-dark

`neo-dark` keeps v12 `theme-neo-dark.js`'s base colours, shadow and corner radius, and takes
`neo`'s geometry (D181). v12 never set `darkMode` on it, so it derived some colours with the
light rules; v13 derives them as a dark theme and fixes one contrast miss (D183, R-THEME-9).
Every other colour is v12 12.2.0's. To get a v12 value back, set it in `themeVariables`.

| Variable | v12 12.2.0 | v13 | Why |
| --- | --- | --- | --- |
| `secondaryBorderColor` | `#2f2f2f` (darkened) | `#6c6d6d` (lightened) | D183: dark rules |
| `tertiaryBorderColor`, `clusterBorder` | `#060606` | `#4d4c4c` | D183: dark rules |
| `noteBorderColor` | `#e4db95` | `#fff8c6` | D183: dark rules |
| `edgeLabelBackground`, `erEdgeLabelBackground` | `#474949` (`secondaryColor`) | the background, as in every theme | D628 |
| `strokeWidth` | 1 | 2, as in `neo` | D183 |
| `secondaryTextColor` | `#b8b6b6` (4.49:1 on `secondaryColor`) | `#b9b7b7` (AA) | D183, R-THEME-9 |
| `altBackground` (state: a nested composite's body) | `#f0f0f0`, on which the `#cccccc` transitions and arrowheads all but vanish | `#404040` | D189, D183 |
| `pie5` | `#2e3030`, a rounding artefact | `#2e2f2f` (`secondaryColor` darkened 10) | D333(a); [Pie chart](#pie-chart) |

The shadow is v12's, written `drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))`. The ER row,
ER marker and palette differences are those of `neo` (D152, D181).

### Neo gradient

With `useGradient` on (`neo`, `neo-dark`, or any theme through `themeVariables`), the outlines
that v12 neo strokes with the gradient take it, and nothing else does (D182):

- **Flowchart:** node outlines (with their inner lines: cylinder rims, double-circle rings,
  braces) and subgraph rectangles. A linked node (`click … href`) takes the gradient and the
  shadow like every other node; v12 neo drew it plain (D184). An icon shape's glyph takes the
  gradient and its frame does not, as in v12 (D298); an icon that is not drawn keeps its frame's
  outline in the gradient.
- **Class:** class boxes, their dividers and namespaces; not notes.
- **State:** states, the choice diamond, composites, notes, the start and end dots, fork and
  join bars.
- **ER:** entity outlines, their rules and subgraphs. An entity's column rules take the gradient
  colour at their position, as the outline does; v12 drew each one half `gradientStart`, half
  `gradientStop` (D185).
- **Sequence:** nothing, as in v12.
- Never edges, edge labels, arrowheads or text. A palette slot and an author `style` /
  `classDef` stroke still win.

An `objectBoundingBox` gradient cannot paint a line whose box has no width or height, so those
lines are drawn in plain `nodeBorder`: the rules of a lined document and a lined or divided
rectangle (v12 stroked them with the gradient), the `fr-circ` inner dot, the `f-circ` and
`browser` lines, the dashed divider between state concurrency regions (v12 dashed
each region's frame with the gradient) and a described state's divider. Class dividers are
lifted 0.01 so they take the gradient (v12 0.001) (D185). The `browser` dots and address bar and
the `console` prompt are plain `nodeBorder` too, as v12 drew them in every look (D683).
No node part is filled with the gradient: the flowchart fork and join bar is stroked with it and
filled in plain `nodeBorder`, the same colour as the `lineColor` v12 neo filled it with (D185).

## Hand-drawn look

v12 drew `look: handDrawn` with roughjs inside `mermaid`. v13 draws it with the optional
`@mermaid-js/plugin-hand-drawn` (D300), which sketches the outlines a diagram draws with roughjs's
DOM-free generator. `renderSync` works with it in Node and the browser, with no DOM.

```sh
npm install @mermaid-js/plugin-hand-drawn
```

- **Activation.** Installed is enabled ([Plugins](#plugins-installed-is-enabled-r-plug-5)): Node
  discovery finds it, as does `@mermaid-js/bundler-plugin`. Elsewhere, register it once:
  `import { handDrawn } from '@mermaid-js/plugin-hand-drawn'; await
  mermaid.registerExternalDiagrams([handDrawn]);`. Diagram text cannot install it.
- **Keys.** The plugin owns `handDrawn` (boolean, default `false`) and `handDrawnSeed` (number,
  default 0), which left core's schema; see the plugin's sections of
  [config-reference.md](./config-reference.md). `look: handDrawn` sets `handDrawn: true`, at the
  top level or in a diagram section, and gives no warning. Other `look` values still warn
  `LOOK_REMOVED`. Installing the plugin changes no default: a diagram without the look draws as
  before (D303).
- **A section's `look` applies to the diagram drawn,** whatever its type: `sequence.look:
  handDrawn` in the config of a flowchart sketches that flowchart. v12 read only the drawn type's
  section.
- **Only `handDrawn: false` turns the sketch off.** `look: classic` and `look: neo` still only
  warn `LOOK_REMOVED`: they do not beat a `look: handDrawn` set in another source (`initialize`,
  front matter, a directive) or at the top level. In v12 the diagram text's `look`, and the
  drawn type's section, won. To draw one diagram plain under a site-wide hand-drawn look, set
  `handDrawn: false` in its front matter or directive.
- **Without the plugin,** `look: handDrawn` draws the plain diagram with one `LOOK_REMOVED`
  warning naming `@mermaid-js/plugin-hand-drawn`, and `handDrawn` or `handDrawnSeed` give
  `CONFIG_UNKNOWN_KEY`, as `elk.*` keys do without ELK (D153).
- **Seed 0 is a fixed seed (D300, D304).** v12's default `handDrawnSeed: 0` drew a random sketch
  on every render. In v13 every seed, 0 included, gives the same drawing on every render and
  machine, and another seed another drawing. A non-zero seed gives roughjs's v12 strokes for the
  same geometry, but v13's geometry is not v12's, so the drawings still differ. Every outline
  shares the seed, as in v12.
- **Node bounds are not measured from the sketch.** v12 measured the roughjs paths (`getBBox`)
  and sized nodes, edges and the viewBox from them. v13 lays out first and sketches after
  (DESIGN §6): the layout, every node and edge position and the viewBox are the same with and
  without the look. A stroke strays at most a few units off the outline (about 2.6 units for a
  120 × 40 node, about 5.6 with its hachure fill), inside the viewBox padding.
- **Paints come from the theme and the diagram (D152, D307),** in every theme: `style`,
  `classDef` and `linkStyle` colours, widths and dash patterns are kept. Under `neo` and
  `neo-dark` the gradient strokes the sketch and the `dropShadow` filter sits on the sketch's
  `<g>`; v12 never combined neo and hand-drawn. Fills are hachured as in v12; state composites
  are solid. One paint is the plugin's own: a mindmap node with a fill and no stroke gets v12's
  `nodeBorder` sketch outline, except the plain node (D693, [Mindmap](#mindmap)).
- **What is sketched (D301):** flowchart (node shapes, their inner lines, subgraphs, the
  collapsed card, edges), class (class boxes, dividers, notes, namespaces, relations), state
  (states, composites, notes, start and end, choice, fork and join, region dividers,
  transitions), ER (entities, attribute rows, dividers, subgraphs, relationship lines),
  mindmap (every node shape, the rule under a plain node, edges), kanban (columns and cards;
  the priority bar is kept, D379), venn (circles and the overlaps a style fills, D319),
  requirement (boxes, dividers, relation lines; the markers stay plain, as in v12),
  ishikawa (the head, label boxes, spine and bones, D494),
  usecase (actor glyphs, use cases, notes, JSON tables and their cells, boundary frames and tabs,
  relationship lines; business marks stay plain, as v12 drew them without roughjs) and
  agentflow (vertices, their inner lines, flow frames, the collapsed card with its separator and
  dots, edges). v12
  did not sketch mindmap's plain node in the classic themes; v13 does (D308). Every edge label
  drawn as a tag (the shared edge-label box, D626) has its 1 px border sketched like a node's
  outline and its fill drawn solid, never hatched; v12 never sketched it (D630).
  Arrowheads and text are never sketched, as in v12.
  Roughness is v12's: 0.7 for nodes, groups and marks, 0.3 for edges. State composites are drawn
  at 0.7, where v12 used roughjs's default of 1. An outline with no fill and no stroke
  (flowchart's `text` and brace hit boxes, state's region frame) stays the plain element.
- **Not sketched:** sequence, gantt, pie, timeline, journey, quadrant and gitGraph draw themselves
  and draw exactly as without the plugin, with no warning, as in v12 (D301, D305); they can opt in
  later. Treemap, which v12 never sketched either, draws the same way. Types v12 sketched that
  v13 has not ported yet (block) are sketched once their ports adopt it.
  `swimlane-beta` is sketched as flowchart is, since flowchart draws it.
- **Text output** (`format: 'ascii'`) is never sketched: it draws as before, with one
  `ASCII_DROPPED` warning (`feature: 'handDrawn'`) for every type with `handDrawn` on, sequence
  included (D305).
- **Size.** roughjs loads with the plugin, not lazily (D306): about 11.2 KB gz for the plugin,
  8.9 KB of it roughjs. `mermaid` and core are the same bytes with or without it (R-PLUG-8).
- **Output size.** A sketched SVG is much larger than the plain one: hachure fills at v12's
  `hachureGap` of 1.5 draw a stroke every 1.5 units, so the SVG grows roughly 5–25× (about 14×
  for a 40-node flowchart; 5–14×, about 10× typically, for mindmaps), most for large filled
  shapes. A large diagram can reach the `maxOutputLength` limit (4,000,000 characters) and fail
  with a `LIMIT` error. The integrator can raise it with
  `initialize({ limits: { maxOutputLength: 20_000_000 } })` or a per-call `config.limits`
  ([Limits](#limits)); diagram text cannot.

### Hand-drawn SVG structure

v13 keeps its own class names on sketched elements (D308): there is no `rough-node` class (v12
swapped it in for `node`) and no `data-look` attribute on clusters. CSS that targets v13's
classes works the same with the look on.

| v12 | v13 | Why |
| --- | --- | --- |
| A sketched node's outline is a `<g>` that `rough.svg` drew, inside a node classed `rough-node` | The node keeps its v13 classes. Its outline (`<rect>`, `<circle>`, `<polygon>`, `<path>`, …) becomes a `<g>` that carries the outline's own attributes other than geometry and paint (`class`, `filter`, `opacity`, `transform`, `style`, data attributes), holding roughjs's paths in its order: the fill, then the outline. A hachure fill is a `<path>` stroked in the fill colour (`fill="none"`), a solid one a `<path>` filled with it (`stroke="none"`). The paths have no ids | D302, D308, R-SEC-2 |
| Clusters with `data-look="handDrawn"`, drawn as a rounded-rectangle path of radius 0 | No `data-look`. A subgraph, namespace or ER subgraph frame is sketched as a rectangle (a rounded one when the frame has rounded corners), with v12's options, so its strokes differ from v12's | D308 |
| Edges: one `<path>` with a sketched `d` | The same: the edge's `<path>` keeps its attributes and gets roughjs's `d`; paint it inherits from its `edgePaths` group stays there | D302 |
| ER: a solid copy of each hachured entity underneath it, so markers do not show through | Dropped: no v13 ER edge or end marker is drawn under an entity, so nothing shows through. A subgraph's fill still shows through a hachured entity, as for a flowchart node in a subgraph | D308 |
| State composites: the title band and an alternate (`statediagram-cluster-alt`) body hachured | Both composite parts are solid: the drawer sees only the outline it draws, and an alternate body's outline does not say it is one. Known gap of 13.0 | D302 |

## Layout

| v12 | v13 | Why |
| --- | --- | --- |
| Default layout `elk` (12.2.0), formerly `dagre` | Default `layered`, the engine built into core | DESIGN §6.1 |
| `layout: dagre`, `layout: elk`, `elk.<algorithm>`, `flowchart-elk` header | `dagre` is drawn with `layered`, silently. The ELK names and the `flowchart-elk` header are drawn with `layered` and one `ELK_NOT_INSTALLED` warning until `@mermaid-js/layout-elk` is registered | R-PLUG-8, D173 |
| Crossing edges hopped only under ELK, the default layout of 12.2.0, and swimlane (`elk.lineHops`, `swimlane.lineHops`); `dagre` and the diagrams with a layout of their own drew them plainly | Line hops are available in every diagram that draws edges, under every layout, and off by default: crossings draw plainly, as under v12's `dagre`, unless a config layer sets the top-level `lineHops` (`true`, `'arc'`, `'gap'`). With it on, where two straight runs cross, the one that gives way draws a 6px arc. The engines that hopped in v12 still do by default: swimlane (`swimlane.lineHops: arc`) and ELK (`elk.lineHops: true`), unless the author sets `lineHops: false`. The hop code is part of core, so `renderSync` needs nothing loaded for it | D537, D672, D689 |
| An unknown layout name falls back to `dagre` with a console warning | Falls back to `layered` with a `LAYOUT_UNKNOWN` warning | R-ERR-4 |
| Mindmap lays out with `cose-bilkent` (not deterministic), or `tidy-tree` with its plugin; `mindmap.layoutAlgorithm` is never read | Mindmap lays out with `tree`, core's two-sided tidy tree (loaded lazily), when no config sets `layout`. `cose-bilkent` and `tidy-tree` map to `tree` silently; `layered`, `dagre` and an installed `elk.*` are honoured; an unknown or uninstalled name draws with `tree` and warns. The mindmap key `layoutAlgorithm` is ignored | D280–D285 |
| `nodeSpacing`, `rankSpacing`, `diagramPadding` | Honoured with v12's defaults (50, 50, 8) | |
| `curve` picks a d3 curve factory | The engine routes edges: `linear` draws straight segments, `step`/`stepBefore`/`stepAfter` stepped ones, `rounded` (the default) straight segments joined by arcs of radius 5, every other value S-curves. `step`, `stepBefore` and `stepAfter` have right-angle corners and put the step in the middle, near the start and near the end of the leg | |
| A `curve` name that is none of the `flowchart.curve` values (`curve: bogus`, `linkStyle 0 interpolate bogus`) is drawn like `basis`, silently | Drawn with the default curve, `rounded`, with one `CURVE_UNKNOWN` warning per name and render; every diagram type that draws edges with `flowchart.curve` (flowchart, class, requirement, agentflow) reports it. Set `curve: basis` to keep S-curves | D602, D681, #356, #1158 |
| An edge label sits at the centre of its rank, midway between the two nodes, whatever arrowheads the edge has | A label sits midway along the line that shows, between the source and the base of the arrowhead: on an edge with one arrowhead it moves 3.5 px toward the end without one, under every curve and under ELK. With arrowheads at both ends or none (and every ER relationship) it stays midway between the nodes. The move is a constant, so it is exact for the classic themes' arrowheads, and the redux and neo labels sit 3.25 px nearer the head than midway. Text output is unchanged | D682, D154, #1148 |
| dagre adds 25 px of rank spacing inside subgraphs | Not reproduced: subgraphs are slightly more compact | |
| An unlabelled edge between a subgraph and one of its own nodes or nested subgraphs, drawn by dagre to a stand-in node | Laid out inside the subgraph from its border, where its flow starts (entering, below the title when that is the top) or ends (leaving). A labelled one runs down from the subgraph's top, its label in a band below the title | #405, #415, #198 |

Node positions differ from v12's dagre and ELK output; layouts are deterministic for the same
input.

### ELK

`@mermaid-js/layout-elk` keeps its v12 name and registration snippet (D171). It ports v12
develop's ELK adapter on the same elkjs version (0.12.0), with every `elk.*` key, the presets and
the passes (D174). Parity is with v12's ELK options, not its pixels.

| v12 | v13 | Why |
| --- | --- | --- |
| `import elkLayouts from '@mermaid-js/layout-elk'; mermaid.registerLayoutLoaders(elkLayouts)` | Unchanged, and in Node (SSR) installing the package is enough: `mermaid`'s Node entry discovers it, `lineHops` included (R-PLUG-5). The package registers v12's seven names (`elk`, `elk.stress`, `elk.force`, `elk.mrtree`, `elk.sporeOverlap`, `elk.box`, `elk.rectpacking`) plus `elk.layered` and `elk.radial`, which were only per-container ids in v12. `elk` and `elk.layered` are both ELK's layered algorithm | D171 |
| Installing the package made ELK the default (`layout` defaulted to `elk`) | Installing it changes no default: ELK lays out only a diagram that names it (`layout:`, a per-type `layout` key, or the `flowchart-elk` header) | D127, R-LAYOUT-7 |
| An ELK name without the package drew with dagre | Drawn with `layered`, plus one `ELK_NOT_INSTALLED` warning per render that names `@mermaid-js/layout-elk` | D173 |
| `elk` config keys (`mergeEdges`, `preset`, `lineHops`, …) were core config | The same keys and v12 develop's defaults, but they belong to the package's config fragment: known only while it is registered ([config reference](./config-reference.md)). Without it, an `elk` section gets one `CONFIG_UNKNOWN_KEY` warning and is ignored | D153, D174 |
| ELK laid out asynchronously (`render()` only) | Synchronous: `renderSync` works once `prepare()` has loaded the engine (else `NotLoadedError` naming `layout "elk"`). elkjs loads only for a diagram that names an ELK layout. Web Worker hosts are not supported, as in v12 | D172 |
| Per-container `id@{ algorithm: elk.box }` laid that container out with its own algorithm | Parsed but not applied yet: the container is laid out with the diagram's ELK algorithm, with one `ELK_ALGORITHM_IGNORED` warning per render listing the algorithms asked for | D174 |
| `elk.radial` did not exist as a layout name (only as a container id); a container that was not a tree failed the render | `layout: elk.radial` lays out a tree radially. A graph that is not a tree (a cycle, or a node with two parents) is drawn with `layered`, plus one `ELK_RADIAL_NOT_A_TREE` warning | D171 |
| `cycleBreakingStrategy: MODEL_ORDER` was set on every container, and elkjs 0.12 threw for a container laid out with its parent, so that render failed | `MODEL_ORDER` is set on the root and on containers ELK lays out on their own (one with its own `direction` that no edge crosses); a container laid out with its parent follows the root's value | D174 |
| `lineHops` drew hops and dropped the rounding of corners | Same hops (arc or gap, v12's radius and rule), drawn on straight runs only; corners keep their rounding. Core draws them (D537): a top-level `lineHops: false` turns ELK's hops off too | D174, D537 |
| v12's frame-evening and label post-passes (`evenGroupFrames`, `separateOppositeEdgeLabels`, `slideTerminalLabelsOffFrames`, `putTerminalLabelsOnTheirSide`, marker segment lengths) | Not ported: no `elk.*` key controls them, and v13's diagrams clip edges at their own outlines. Two edges into one side can share an end point | D174 |
| Spacing from `spacing.baseValue` | Spacing comes from the diagram's `nodeSpacing` and `rankSpacing`, as for `layered` | D174 |
| Text output did not exist | Text output (`format: 'ascii'`) always lays out with `layered` and the cell profile, plugin or not, with one `ASCII_DROPPED` warning (`feature: 'layout'`) for the ELK name and no `ELK_NOT_INSTALLED` | D179 |

### Class diagram layout

| v12 | v13 | Why |
| --- | --- | --- |
| Class diagrams default to ELK | Laid out with `layered`, the engine built into core; `layout: elk` is accepted and drawn with `layered` until the ELK plugin (M3.5) is registered | D106 |
| Class `nodeSpacing` and `rankSpacing` were read from the `state` section (falling back to 50), and `class.diagramPadding` was ignored (8 px) | `class.nodeSpacing`, `class.rankSpacing` and `class.diagramPadding` are honoured, with v12's effective defaults (50, 50, 8) | spec #126 |
| Class edges followed `flowchart.curve` (a d3 curve factory) | Follow `class.curve`, then the top-level `curve`, then `rounded`; `flowchart.curve` is not read. The names are read as for flowcharts: `rounded` (the default) and `step`/`stepBefore`/`stepAfter` are right-angle routes, `linear` straight segments, every other value S-curves | spec #126; D733, #1378 |
| A lollipop interface was a top-level node, outside its class's namespace | It sits in the namespace of its class | spec #126 |
| `lineHops` on crossing relations | Core's shared edge-path step draws them, under `layered` and `layout: elk` alike: where a straight run crosses another relation, the run that gives way draws a 6px hop (`gap`: a break). The relations leaving one side of a class are about 5px apart (3px under ELK), so a run that crosses two of them crosses at points too close to carry a hop each, and neither hops, by the same rule as for every diagram (`hopPaths`). The shared key defaults to `false` (D689), so crossings hop only where a document turns hops on | D537, D689, #655 |

### Class diagram config

- **Both keywords:** `classDiagram` and `classDiagram-v2` are one type, detected by v12's one
  `classDiagram` detector and drawn by one renderer (D101), as SVG only: `format: 'ascii'` throws
  `UnsupportedFormatError` (D100).
- **Honoured** in the `class` section: `theme`, `layout`, `useMaxWidth`, `padding`, `nodeSpacing`,
  `rankSpacing`, `diagramPadding`, `hideEmptyMembersBox` and `hierarchicalNamespaces`. v12's class
  renderer read `useMaxWidth`, `nodeSpacing` and `rankSpacing` from the `state` section (a v12
  bug); v13 reads them from `class`.
- **Documented defaults changed (D125):** `class.padding` is documented as 12, not 5, and
  `class.diagramPadding` as 8, not 20. These are the numbers v12 drew with: its schema defaults
  never reached the renderer. A diagram that sets neither looks as in v12: class boxes padded 12,
  namespaces 16, notes 6, the diagram 8. A `class.padding` you set pads boxes, namespaces and
  notes alike, as in v12.
- **Layout:** `class.layout` has no default of its own, as in v12, so the top-level `layout`
  applies: `layered`, even with an ELK plugin installed (D127, R-LAYOUT-7). `layout: elk` is
  honoured when an author sets it.
- **Ignored:** `titleTopMargin` (no front-matter title is drawn, as for flowcharts), `useWidth`
  (only gantt read it), and `dividerMargin` and `textHeight`, which only v12's old class renderer
  read; 12.2.0 sent both keywords to the unified renderer, which did not.

### ER diagrams

| v12 | v13 | Why |
| --- | --- | --- |
| Laid out by ELK, v12's default `layout` | Laid out by the built-in `layered` engine, like every graph diagram; `layout: elk` maps to it, with an `ELK_NOT_INSTALLED` warning, until `@mermaid-js/layout-elk` is registered. Installing that package changes no default | DESIGN §6.1, D106, D171 |
| ELK's orthogonal routes | Stepped routes (right angles), the nearest `layered` routing | |
| Table cells padded by `er.diagramPadding` (across) and `er.entityPadding` (down), times 1.25 without HTML labels | Every cell padded by `er.entityPadding` (default 15 px) on each side, across and down; `er.diagramPadding` (default 20 px) is the margin around the drawing. Text output keeps 1 cell across and no margin | D116, ADR-13 |
| `er.nodeSpacing` / `er.rankSpacing` (140 / 80) and `er.minEntityWidth` (100) | Honoured with the same defaults in SVG. Text output uses the cell profile's spacing and widths unless the diagram sets these keys. A value equal to the default counts as not set in text output: setting exactly `nodeSpacing: 140`, `rankSpacing: 80` or `minEntityWidth: 100` draws the compact cell spacing, and any other value converts from px | D118, D124 |
| Text output's gap between ranks | At least 6 cells (the cell profile's own is 4), so a relationship's two crow's-foot ends and its label each keep a line cell between them | D124 |

The `er` keys `layoutDirection`, `minEntityHeight`, `fontSize`, `stroke` and `fill` are
ignored: mermaid 12.2.0 no longer read them either (only its legacy ER renderer did). Use the
`direction` statement and the `fontSize`, `mainBkg`, `nodeBorder` and `lineColor` theme
variables instead.
| Entities with attributes and subgraph titles measured by the browser | Measured before layout with the injected measurer, in the font each is drawn in | DESIGN §6.1 |

## Labels and text

| v12 | v13 | Why |
| --- | --- | --- |
| HTML labels in `<foreignObject>` (`htmlLabels: true`) or SVG text | SVG `<text>`/`<tspan>` only. HTML labels come back with the optional `@mermaid-js/plugin-html-labels` ([HTML labels](#html-labels)) | D5, D694 |
| Any HTML in labels, sanitised by DOMPurify | `<b>`/`<strong>` and `<i>`/`<em>` are drawn bold and italic, `<u>`/`<ins>` underlined, `<s>`/`<strike>`/`<del>` struck through, `<sub>`/`<sup>` smaller and shifted down or up (the line keeps its height), and `<br>` breaks the line, in every diagram type. **Changed on purpose:** every other tag, with or without attributes, start or end tag, is drawn as written text, in every mode and every diagram type, where v12 rendered or sanitised it: `<img src=x>` and `<span>s</span>` show their tags, and `<script>alert(1)</script>` shows as that text, content included. A label is never emptied by a tag. The text is escaped when written, so nothing in it becomes an element. Text that only looks like a tag, such as `List<T>`, is shown as written as before. There is no `HTML_DROPPED` warning any more. For a link, use `click id "url"` | R-TEXT-3, D566, D710, #1440 |
| Markdown strings (`` "`**bold**`" ``) | Same subset: `**`/`__` bold, `*`/`_` italic, `` `code` `` (monospace), `- ` and `* ` bullet lists (one nesting level), backslash escapes, `<br>` and newlines | R-TEXT-2 |
| Some types read Markdown in a label written without backticks | **Changed on purpose:** Markdown is read only in a markdown string, a whole label in backticks with or without double quotes around them (`` "`**bold**`" `` or `` `**bold**` ``), the same in every diagram type. Any other label draws tags, `<br>` and entity codes, and shows `**`, `_`, backticks and a leading `- ` as written. The types move to this rule one by one, and each type's section lists what changes for it; until then the rows above for mindmap, state, requirement, class and ER hold | D710, #1333 |
| Mindmap, state, requirement and class labels were read as Markdown without backticks: `**bold**` and `_italic_` were formatted, and a label starting with `- `, `* ` or `+ ` or holding backticks was shown as written | The same: bold and italic are read, list markers and code spans are drawn as written. In a label that holds a code span, bold and italic outside the span are read. Only a mindmap markdown string (`` "`…`" ``) has bullets and inline code. Not Markdown: the title and rows of a state with several description lines, class multiplicities, namespace titles and lollipop interface names | D564, D610, #763, #836 |
| Sequence labels broke at `<br>` only; `\n` written as two characters was drawn | The same: a written `\n` is text in participant, message, note and block labels. In the other types a plain label still breaks there | D564, #763 |
| Markdown emphasis in a label written without backticks, in the types that pass every label through Markdown: ER (`"This **is** _Markdown_"`) | ER reads `**`/`__` as bold and `*`/`_` as italic in entity names, aliases, attribute cells, relationship labels and subgraph titles, and nothing else of Markdown: backticks and a leading `- ` are drawn as written. An underscore inside a word (`order_item`) is text. Text output drops the markers | #754, D562, D565 |
| Entities: Mermaid's `#quot;`/`#35;` and HTML `&…;`, decoded by the browser, so every HTML5 name worked | Both decoded; about 70 named HTML entities plus numeric ones. The names include the ASCII punctuation used to escape syntax: `colon`, `semi`, `vert`, `verbar`, `lpar`, `rpar`, `lsqb`, `rsqb`, `lcub`, `rcub`, `num`, `excl`, `quest`, `commat`, `equals`, `plus`, `comma`, `period`, `sol`, `bsol`, `grave`, `lowbar`, `percnt`, `dollar`, `ast` | #396, D561 |
| An entity code without its `;` (`&lt`, `&#60`), decoded by the browser | The same: a numeric code needs no `;`, and so does a name HTML reads without one, also at the start of a longer word (`&ltx` draws `<x`): `amp`, `lt`, `gt`, `quot`, `nbsp`, `shy`, `copy`, `reg`, `deg`, `plusmn`, `times`, `divide`, `middot`, `sect`, `para`, `pound`, `yen`, `cent`, `laquo`, `raquo`. Other names need their `;`; `#lt` without `;` stays as written | D709, #1313 |
| A `#name;` with a name the browser did not know was drawn `&name;` (`#bogus;` drew `&bogus;`) | Drawn as written, `#bogus;`. A literal `&bogus;` also stays as written | D561, D564, D565 |
| Gantt, gitGraph, treeView and railroad set their text with `.text()`: a `#35;` code drew `#`, a typed `&amp;` drew `&amp;` | Both are decoded, in the SVG and in text output; markup, `$$` and `fa:` still print as written in these types | D563 |
| KaTeX math (`$$…$$`) | Rendered by the optional `@mermaid-js/plugin-math` (`registerExternalDiagrams([math])`): MathJax typesets the TeX into SVG paths, so glyph shapes differ from KaTeX's. MathJax loads only for a diagram with math; `renderSync` needs `prepare()` or `preload({ math: true })` first. TeX that does not parse is shown as written with a `MATH_ERROR` warning. Every label core lays out takes math: flowchart nodes, edges and subgraph titles; class, state and ER labels; sequence messages, notes, participants, fragment and box labels. Without the plugin the TeX is shown as written, with one `MATH_NOT_RENDERED` warning per render. Text output always shows the TeX as written, with one `ASCII_DROPPED` warning (`feature: 'math'`). `legacyMathML` and `forceLegacyMathML` are ignored. See [Math](#math) | D5, D175, D176, D178, D179 |
| `fa:fa-car` in HTML labels: an icon from a registered pack, else `<i class="fa fa-car">` for Font Awesome's CSS to draw | An icon from a registered Iconify pack, drawn as SVG paths by the optional `@mermaid-js/plugin-icons`, in every label core lays out (sequence too); page CSS draws nothing. An icon that does not resolve is shown as written, with one `ICON_NOT_RENDERED` warning per render. See [Icons](#icons) | D290, D291, D292, D296 |
| Text measured by the browser | Measured by canvas when present, else by built-in tables for Trebuchet MS, Verdana, Arial and Courier New (the monospace names use Courier New's, D644) and any `fontTables` the integrator adds (D645); line height comes from the font, so labels are not pixel-equal with v12 | R-TEXT-4 |
| Labels wrap at `flowchart.wrappingWidth` (HTML labels) | Node labels, plain and markdown alike, wrap at `wrappingWidth` (120) and are widened to `minNodeWidth` (120), except circles; edge labels wrap at 200. CJK text breaks between characters, a line breaks after a hyphen between letters as HTML labels did (`subcontainer-` / `sibling`), and a word wider than the box is split | #394 |

### Math

v12 rendered `$$…$$` with KaTeX into MathML or HTML; v13 typesets it with MathJax (TeX input, SVG output) into plain `<path>` glyphs, through the optional `@mermaid-js/plugin-math` (D175). The TeX is read as v12 read it: display mode, one formula per `$$…$$` pair, on one line. What differs:

- **Glyphs.** Both use Computer Modern designs, but MathJax's TeX font is not KaTeX's: outlines, kerning and spacing differ slightly, and stretched delimiters, braces and arrows (`\left(`, `\overbrace`, `\xrightarrow`) are built from different pieces. Math is a little smaller next to the label text: its em is 1.13 times the label's font size, where KaTeX's was 1.21.
- **Colour.** Glyphs take the label's text colour. `\color{red}` is a switch, as in LaTeX and KaTeX: write `{\color{red}x}` to colour one part.
- **Characters the TeX font lacks** (CJK or emoji in `\text{…}`) are drawn as text in the label's font, measured like the rest of the label.
- **KaTeX-only names** v12 accepted are mapped: KaTeX's texvc names (`\Alpha`, `\Reals`, `\empty`, `\isin`, `\N`, `\cnums`, …), `\notni`, `\relax`, and `\phase` (drawn with round joins).
- **Not supported**: the span is shown as written, with `MATH_ERROR`. `\def`, `\newcommand` and `\renewcommand` (MathJax would keep a definition from one formula to the next, so one label could change another), `\href`, `\style`, `\class`, `\unicode` and `\htmlClass` are undefined control sequences; `\tag` (an equation number) is refused. Only the TeX packages `base`, `ams`, `boldsymbol`, `cancel`, `color` and `enclose` are loaded.
- **Class members** read as in v12: a member ending in `$` is static, so `+x $$a$$` is drawn underlined as `+x $$a$`. Put the TeX before the end (`+$$a$$ x`).
- **Errors.** v12 drew KaTeX's error for TeX that does not parse; v13 shows the span as written, with one `MATH_ERROR` warning naming MathJax's message.
- **Limits.** A label draws at most 32 formulas; the rest are shown as written. A label that contains a character in U+FDD0–U+FDEF (Unicode non-characters, which v13 uses to mark formulas inside a label) draws none. Either gives one `INLINE_LIMIT` warning per render (core's, for any inline span, not only math).
- **No MathML.** Nothing in v13 output is MathML or HTML, so `legacyMathML` and `forceLegacyMathML` have no effect, and no KaTeX stylesheet is needed.
- **Loading.** MathJax loads only for a diagram with a `$$…$$` pair in a label. `render()` loads it; `renderSync` needs `prepare()` or `preload({ math: true })` first, or throws `NotLoadedError` naming `math "tex"`.

### Icons

v12 drew `fa:fa-car` in a label only in HTML labels (`htmlLabels: true`): as the icon of a
registered pack, or else as `<i class="fa fa-car">` for Font Awesome's CSS to draw. v13 labels
are SVG text (D5), so there is no `<i>` element and page CSS cannot draw an icon. Icons come from
[Iconify JSON](https://icones.js.org/) packs registered in code and are drawn as SVG paths by
the optional `@mermaid-js/plugin-icons` (D290, D291). To keep `fa:` icons, install the plugin
and a Font Awesome pack, and register the pack under the prefix your diagrams use:

```js
import mermaid from 'mermaid';
import { icons } from '@mermaid-js/plugin-icons';

await mermaid.registerExternalDiagrams([icons]); // not needed when it is discovered on install
mermaid.registerIconPacks([
  { name: 'fa', loader: () => import('@iconify-json/fa6-solid').then((m) => m.icons) },
  { name: 'fab', loader: () => import('@iconify-json/fa6-brands').then((m) => m.icons) },
]);
```

[Icons](./icons.md) has the setup in full. What differs from v12:

- **Prefixes and names.** Labels read v12's prefixes plus `fad`: `fa`, `fab`, `fad`, `fak`,
  `fal`, `far` and `fas` (D296). `fa:fa-car` is the icon `car` of the pack registered as `fa`, so
  each prefix your diagrams use needs its own pack. Names are the pack's: `fa6-solid` has Font
  Awesome 6 names, so a Font Awesome 5 name it renamed (`fa:fa-home`, now `house`) does not
  resolve; register `@iconify-json/fa-solid` (Font Awesome 5) as `fa` to keep those. There is no
  generic `pack:name` in labels, so text such as `note:item` stays text.
- **No `htmlLabels` gate, every type.** Icons are drawn in every label core lays out: flowchart
  nodes, edges and subgraph titles; class, state and ER labels; sequence messages, notes,
  participants, fragment and box labels, which v12 drew as plain text (D292). Class relation
  labels and single-line state notes cannot hold `:` (v12's grammar), so they cannot hold an icon.
- **Look.** A label icon is 1em tall at the label's font size, as wide as its aspect makes it,
  with its bottom 0.125em below the baseline (v12's `.label-icon`), in the label's text colour:
  `currentColor` fills and strokes both take it. It has no class, so CSS aimed at `.label-icon`
  or `i.fa` selects nothing.
- **Loading.** A loader runs only for a diagram that names its pack: in `render()` and
  `prepare()`, or up front with `preload({ iconPacks: ['fa'] })`. `renderSync` before that throws
  `NotLoadedError` naming the pack; with `placeholders: true` it draws an empty 1em box instead
  (an icon shape draws its frame, or nothing without a `form`), with `PLACEHOLDER` (D299). A loader that rejects no longer
  fails the render: its icons are not drawn, the warning names the pack, and the next `prepare()`
  retries it.
- **Not drawn: shown as written.** An icon that does not resolve (no plugin, no pack of that
  name, no such icon, a pack whose loader failed or that is not Iconify JSON, a shape icon name
  that is not `pack:name`) stays in the label as written, `fa:fa-car`, and an icon shape draws
  its frame alone (nothing, without a `form`), with one `ICON_NOT_RENDERED` warning per render
  (D291), as `MATH_NOT_RENDERED` does for math. With the plugin it names the icons and why;
  without it, it says icons need an icons extension. While packs are registered and no icons
  extension is, every render also warns `ICON_PACKS_UNSUPPORTED`. `ICON_UNAVAILABLE` (flowchart icon
  shapes) is deprecated: for one alpha it is still raised once per render next to
  `ICON_NOT_RENDERED`, naming the icon shapes not drawn, and never for a placeholder render
  (D299). Read `ICON_NOT_RENDERED` instead.
- **What an icon may hold (D295).** An icon's body is not inserted as markup: the plugin
  rebuilds it from `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon` and
  `text` with their presentation attributes (`style="…"` declarations become attributes), so no
  icon pack can put script or links into a diagram (R-SEC-2). `defs`, gradients, `mask`,
  `clipPath`, `use`, `style`, `image` and animation are dropped, as are `id`, `class` and event
  attributes, and `url(#…)` paints become `currentColor`. A diagram with an icon changed that way
  gets one `ICON_SIMPLIFIED` warning per render naming them. No `fa6-solid` or `mdi` icon is
  changed; about one `logos` icon in five uses a gradient and is drawn flatter than in v12.
- **Icon shapes** (`@{ icon: … }`) draw their glyph with the plugin, as in v12; an icon not drawn
  keeps its frame (see [Flowchart syntax](#flowchart-syntax)).
- **Mindmap** `::icon(fa fa-book)` and `::icon(mdi:fire)` get the slot v12's older mindmap
  renderer reserved (D297): beside the label, or above it in a circle. 12.2.0 parsed `::icon()`
  but drew nothing, so any mindmap icon is new. With the plugin the glyph is drawn there, 40 px,
  in the colour of the node's label: `fa fa-book` is `fa:book`, `mdi mdi-fire` is `mdi:fire`,
  looked up in the registered packs. Only those two forms are icon names: `fa-book` or `bomb`
  is shown as written. An icon that does not resolve, any other form, or any icon without the
  plugin is shown as written in the slot, sized to fit it, with one `ICON_NOT_RENDERED` per
  render (D286, D291); while its pack loads, the slot is empty.
- **Text output** shows label icons as written, with one `ASCII_DROPPED` warning
  (`feature: 'icon'`); an icon shape is a box with its label (`feature: 'image'`) (D299).
- **Size.** Core does not change with the plugin installed (R-PLUG-8); the plugin is about
  5.5 KB gz, plus the packs your diagrams load.

### HTML labels

v12 drew flowchart labels as HTML in a `<foreignObject>` unless `htmlLabels` was false. v13's core draws every label as SVG text (D5). The optional `@mermaid-js/plugin-html-labels` brings HTML labels back (D694):

```js
import mermaid from 'mermaid';
import { htmlLabels } from '@mermaid-js/plugin-html-labels';

await mermaid.registerExternalDiagrams([htmlLabels]);
```

| v12 | v13 with the plugin | Why |
| --- | --- | --- |
| `htmlLabels` true by default in flowcharts, false in class diagrams | On for every type once the plugin is registered. `htmlLabels: false` turns it off, as do `flowchart.htmlLabels` and `class.htmlLabels`, whatever type is drawn; the plugin's own key is `html.labels` | D696 |
| The svg string held the `<foreignObject>` labels | The svg string holds a placeholder for each label and no HTML, so it is still safe to insert with no sanitizer. `run()` and `mount()` swap the labels in. A page that inserts the string itself calls `result.bindFunctions(el)`, as v12 pages did for click callbacks, or `mountHtmlLabels(el)` for a stored string | D694, D697 |
| Any HTML that DOMPurify's defaults let through, with `dompurifyConfig` to change them | A fixed list of text, list, table, link and image elements, sanitised by DOMPurify, which cannot be turned off or configured. Links and image sources pass `linkSchemes`. A `style` attribute loses declarations that position the element or load something (`url(…)`). Other HTML tags, and text shaped like one (`List<T>`), are shown as written; `<script>` and `<style>` are dropped with what they hold | D694 |
| `securityLevel` decided what HTML a label kept | The plugin's list decides it, at every level. `strict` still limits links and image sources to relative ones, as it does for core's links | D694 |
| v12 always ran with a DOM | Browser only. Without a DOM, in a deterministic render and in text output the labels are SVG text, as without the plugin | D697 |
| Math and `fa:` icons inside HTML labels | A label with `$$…$$` or `fa:…` stays an SVG label, drawn by the math and icons plugins; its other tags are drawn as written text, as without the plugin | D697, #1440 |
| Every label of the unified renderer | Every label core lays out. Text a diagram draws itself (info, railroad, sankey, treeView, wardley, and secondary text in gantt, kanban, class, packet, quadrant, sequence, treemap and xychart) stays SVG | D697 |
| Labels styled by the diagram's style sheet (`.nodeLabel`, `.edgeLabel`) | No style sheet. A label takes the font and text colour core resolved; its wrapper has the class `html-label` for the page's own CSS | D697 |

A page that exports the svg string, or shows it through `<img>`, sets `htmlLabels: false`: the placeholders hold no visible text, and most rasterizers do not draw `<foreignObject>`.

## Flowchart syntax

The flowchart parser accepts exactly the v12 language: a differential test runs v12 and v13
over every e2e fixture and the v12 spec and docs examples, and the grammar is published in
[syntax/flowchart.md](./syntax/flowchart.md). The differences:

- **Error messages** are new: they name what was expected in words (``Expected an arrow such
  as `-->` …``), show the line with a caret, and never mention token or rule names. Every error
  in the text is reported, not only the first (R-PARSE-4).
- **A bare `subgraph`** (no id) is accepted; v12 crashed with a `TypeError`.
- **Edge ids** follow v12 12.3.0, ahead of the oracle (D621): an edge id may follow a node's
  shape or its shape data directly (`A[bla]e1@--> B`, `A@{ shape: circle } e1@--> B`), and an
  `@` in a label needs no space before it (`A[me@example.com] --> B`). As in 12.3.0, an edge
  id can no longer contain `[`, `]`, `(`, `)`, `{`, `}` or `|`: they end the id, which is what
  lets it start right after a node's brackets. `A e[1]@--> B`, which 12.2.0 read as the edge
  `e[1]`, is a syntax error; rename the id. `swimlane-beta` reads edge ids the same way;
  agentflow keeps the 12.2.0 rule, as v12's agentflow does.
- **Shape data** (`A@{ shape: … }`) is read with v13's YAML reader: YAML anchors (`&a`) are
  rejected, which js-yaml accepted. A few malformed values that js-yaml rejected are accepted.
- **Shapes** not in the documented shape list (`classBox`, `erBox`, `usecase*`, `bpmn-*`,
  `kanbanItem`, mindmap shapes) draw as a rectangle.
- **Icon shapes** (`@{ icon: … }`, `form` `square`, `circle`, `rounded`) draw their glyph with
  `@mermaid-js/plugin-icons`, as v12 did (D292, D298): the glyph takes the node's `stroke`
  style, else `nodeBorder` (the gradient under `useGradient`), and the frame is borderless (its
  stroke is its fill). An icon that is not drawn (no plugin, no such pack or icon, a pack still
  loading under `placeholders`) keeps the frame with its outline, not v12's blue `?`.
  `ICON_UNAVAILABLE` is deprecated in favour of `ICON_NOT_RENDERED`. See [Icons](#icons).
- **Edge `animate` and `animation`** move the edge's dashes as v12 did (#918, D606): the
  pattern `9,5` with round caps, running from the source to the target, in 20 s for `fast` and
  `animate: true` and in 50 s for `slow`. The edge keeps its `edge-animation-fast|slow` class.
  The motion is an SVG `<animate>` in the edge's group, not v12's `@keyframes`, since the output
  has no `<style>`; CSS that overrode v12's `animation` on `.edge-animation-*` has no effect on
  it.
- **Step animation** (`step` on edges, `flowchart.stepNumbers`, `flowchart.stepDuration`) is
  parsed but not drawn.
- **`markdownAutoWrap: false`** keeps a markdown label (node, subgraph or edge) on its own line
  breaks, as v12 did (#357).
- **`style`, `classDef` and `linkStyle`** go through a per-property allow-list; an unknown
  property or unsafe value (`url(`, `expression(`, `javascript:`, `@import`, …) is dropped with
  `STYLE_PROPERTY_DROPPED` or `STYLE_VALUE_DROPPED`. `color` sets the label's fill.
  `mix-blend-mode` joined the allow-list with `normal` and `multiply` only (D392): author
  `style` and `classDef` keep it in every type, where they used to drop it with a warning.
  Output without it is unchanged.
- **`maxEdges`** (default 5,000; v12 had 500) is still the edge limit; going over it fails
  with a `LIMIT` error. See Limits under Public API.

## Sequence syntax

The sequence parser accepts the v12 language (oracle parity over every e2e fixture and the
v12 spec strings; grammar in [syntax/sequence.md](./syntax/sequence.md)). The differences:

- **Error messages** are new, as for flowchart, and every error is reported, not only the
  first. A `box` that holds a line other than a participant line is reported once, as missing
  its `end`.
- **`create` and `destroy`** take effect at the message that creates or destroys the
  participant. v12 drew them only when that message was the very next row, so a note or a block line in
  between (or a `create` between a `destroy` and its message) silently dropped the creation
  or the destruction (D123).
- **A message after the destroying one** is accepted as in v12, with a
  `SEQUENCE_AFTER_DESTROY` warning: it is drawn below the participant's end.
- **Math** (`$$…$$`) in messages, notes, aliases, fragment and box labels is drawn by the math
  plugin, as in every type (see [Math](#math)). Without it the TeX is shown as written, with
  core's `MATH_NOT_RENDERED`. `SEQUENCE_MATH` is deprecated: it is still raised once per render
  next to `MATH_NOT_RENDERED` (or `ASCII_DROPPED` in text output) for one alpha, and is no longer
  a parse warning. It is not raised for TeX the math plugin refuses (`MATH_ERROR`) or for a
  placeholder render (`PLACEHOLDER`).
- **Icons** (`fa:fa-car`) in messages, notes, participants, fragment and box labels are drawn by
  the icons plugin from a registered pack; v12 drew them as plain text (see [Icons](#icons)).
- **An unknown participant type** (`@{ type: robot }`) draws a participant box, with a
  `SEQUENCE_PARTICIPANT_TYPE` warning; v12 drew nothing.
- **Box colours** are checked without a browser, with the rules a browser's `CSS.supports`
  applies (named and system colours, `rgb()`/`hsl()` in legacy and modern syntax); `calc()`
  inside a colour is not read and makes the word part of the title.
- **Detection is v12's, quirks included.** v12's C4 detector runs before the sequence one and
  matches `C4Container`, `C4Component`, `C4Dynamic` or `C4Deployment` anywhere in the text, so a
  sequence diagram that names a participant `C4Container` is detected as C4. v12 then drew a C4
  diagram; v13 has no C4 package yet and throws `UNSUPPORTED_DIAGRAM`. Rename the participant
  (or use an alias: `participant C as C4Container` still matches, `participant C as Container`
  does not).
- **Limits** (R-SEC-5, D608): a sequence diagram may have up to `limits.maxNodes` participants
  (10,000) and `limits.maxEdges` messages (5,000), messages inside blocks included; a
  participant made by a message, a note or `create` counts, and notes are not messages. Over
  either, render rejects with a `LIMIT` `MermaidError`. v12 had no such limit. Only the
  integrator can raise them ([Limits](#limits)).

## State diagram syntax

### Layout

- **Default layout:** v12 drew state diagrams with ELK by default; v13 uses `layered`, the
  engine built into core, and keeps it even when an ELK plugin is installed (D127, R-LAYOUT-7:
  ELK is never the default). ELK applies only when an author sets `layout: elk`; until an ELK
  plugin is registered that is drawn with `layered` (D106), as for flowcharts.
- **Notes** are placed along the flow: the engine has no same-rank constraint, so in a TB
  drawing `note right of X` sits below `X` and `note left of X` above it (in LR, to the right
  and left). A note sits in its state's composite; v12 put every note at the top level.
- **Concurrency regions** are laid out side by side across their composite's flow, with a
  divider between neighbours. A transition between two regions of one composite stacks them
  along the flow instead, as in v12 (D113).

### Config

- **`state` section:** `wrappingWidth`, `minNodeWidth`, `nodeSpacing`, `rankSpacing`,
  `useMaxWidth`, `theme` and `layout` work as in v12, except that `layout` defaults to
  `layered`, not v12's `elk` (D127, see Layout).
- **`titleTopMargin`** places the front-matter title, as in v12 (D652).
- **Ignored:** `useWidth` (only gantt read it), and the sizes only v12's
  old dagre renderer read: `dividerMargin`, `sizeUnit`, `padding`, `textHeight`, `titleShift`,
  `noteMargin`, `forkWidth`, `forkHeight`, `miniPadding`, `fontSizeFactor`, `fontSize`,
  `labelHeight`, `edgeLengthFactor`, `compositTitleSize` and `radius`. Sizes come from the theme
  (`fontSize`, `radius`) and the state metrics. They are accepted without a warning.
- **Text output:** `format: 'ascii'` is not available for state diagrams; it throws
  `UnsupportedFormatError` and `supportsFormat('stateDiagram', 'ascii')` is `false` (D100).

### Removed v12 behaviour

- **A trailing empty concurrency region** (a composite state whose last `--` has nothing after
  it) is not drawn. v12 split no regions there and drew each `--` as a stray, unlabelled
  `divider` node. v13 draws the composite without regions and gives one `EMPTY_REGION` warning
  per diagram (D115).
- **Statements that do nothing now warn** (pitfall 22), and are accepted or rejected as in
  v12: `classDef`, `class` and `style` inside a composite state (v12 reads them from the top
  level only) warn `IGNORED_IN_COMPOSITE`, as does `click` there (v12's lexer reads that line
  as state names); a top-level `click` on a composite or on a state that is not drawn warns
  `LINK_NOT_DRAWN`; `scale … width` warns `SCALE_IGNORED`; and `A:::cls` that sets no class
  (on a state written on its own, or anywhere inside a composite: v12 applies `:::` only in a
  top-level transition) warns `CLASS_NOT_APPLIED` (D128). Completion no longer offers
  `classDef`, `class`, `style`, `click` or `scale` inside a composite.

## Quadrant chart config and theme

Spec #289. The SVG changes are under [Quadrant chart SVG structure](#quadrant-chart-svg-structure).

- **`quadrantChart` section:** every key v12's quadrant chart reads works as in v12:
  `chartWidth`, `chartHeight`, `titleFontSize`, `titlePadding`, `quadrantPadding`,
  `xAxisLabelPadding`, `yAxisLabelPadding`, `xAxisLabelFontSize`, `yAxisLabelFontSize`,
  `quadrantLabelFontSize`, `quadrantTextTopPadding`, `pointTextPadding`, `pointLabelFontSize`,
  `pointRadius`, `xAxisPosition`, `yAxisPosition`, `quadrantInternalBorderStrokeWidth`,
  `quadrantExternalBorderStrokeWidth` and `useMaxWidth`. A configured `0` is honoured, as in v12.
- **Value types:** a numeric string (`"pointRadius": "7"`) is read as its number, as v12 drew
  it. A length that is no number of 0 or more (`"big"`, `-3`, `true`), or an axis side that is
  not one of its two (`xAxisPosition: "middle"`), falls back to the default with one
  `QUADRANT_CONFIG_INVALID` warning per key (D226). v12 wrote `NaN` or joined the string into
  its sums.
- **Ignored:** `useWidth` (only v12's gantt read it), accepted without a warning.
- **Not config keys:** v12's builder also had `showXAxis`, `showYAxis` and `showTitle`, which
  no config could reach. They are not schema keys, so setting them gives a `CONFIG_UNKNOWN_KEY`
  warning (R-CONF-2). An axis shows when it has text, the title when it is not empty.
- **Descriptions:** v12's schema described `titleFontSize`, `titlePadding` and
  `quadrantPadding` with the text of the next key. They now say what each key does: the title's
  font size, the padding above and below the title, and the padding around the quadrant square.
- **Front-matter `title`** is drawn as the chart title; a `title` statement in the text wins,
  as in v12 (D218).
- **Text output:** `format: 'ascii'` is not available for quadrant charts; it throws
  `UnsupportedFormatError` and `supportsFormat('quadrantChart', 'ascii')` is `false` (D216).
- **Theme variables:** the 15 `quadrant*` variables keep their v12 names and are listed in
  [theme variables](theme-variables.md): `quadrant1Fill`–`quadrant4Fill`,
  `quadrant1TextFill`–`quadrant4TextFill`, `quadrantPointFill`, `quadrantPointTextFill`,
  `quadrantXAxisTextFill`, `quadrantYAxisTextFill`, `quadrantInternalBorderStrokeFill`,
  `quadrantExternalBorderStrokeFill` and `quadrantTitleFill`. Each is also a `--mermaid-<name>`
  CSS variable, so a host can re-colour a rendered chart (R-THEME-3). They are derived by the
  same rules as v12 in every theme; where the result differs (`quadrantPointFill`, D231; the
  fills 2–4, D232; the borders) the SVG structure table says how.

## State diagram SVG structure

What changed in the state diagram's SVG compared with both v12 renderers: the unified renderer
(`stateRenderer-v3-unified`, `stateDiagram-v2` and the shared shapes) and the old dagre renderer
(`stateRenderer.js` + `shapes.js`, which earlier v12 releases used for the `stateDiagram`
keyword; 12.2.0 sends both keywords to the unified one). v13 has one renderer for both keywords
(D101). v12 class names that still describe something are kept
(`statediagram-state`, `statediagram-cluster`, `statediagram-cluster-alt`, `statediagram-note`,
`transition`, `note-edge`, `state-start`, `state-end`, `end-state-inner`, `fork-join`, `divider`,
`outer`, `inner`, `cluster-label`, `edgeLabel`, user `classDef` classes).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="statediagram"`, `aria-roledescription="stateDiagram"`; old renderer: a `<g id="<id>-root">` and a `viewBox` from `getBBox()` (often negative), width ×1.75 | No root `id`; `class="mermaid mermaid-state statediagram"`, `role="img"`, `data-mermaid-version`, `viewBox="0 0 w h"` from the layout | The only ids are `<id>-title` and `<id>-desc` (R-A11Y-1); no DOM measuring (R-TEXT-4) |
| `<style>` with `state/styles.js` CSS scoped by the root id; `[data-look]` rules | No `<style>` (except `theme: 'auto'`); colours are presentation attributes reading `var(--_x)` aliases; no `data-look` | Inert output (R-SEC-2); `look` is removed (D153) |
| Unified: `<g class="root">` with `clusters`, `edgePaths`, `edgeLabels`, `nodes`; old: a nested `<g class="stateGroup" id>` per state and per composite, laid out by one dagre run per composite | Root children are `clusters`, `edgePaths`, `edgeLabels`, `nodes`, one layout for the whole diagram | One drawing, one layout (#144) |
| Element ids `state-<id>-<n>`, `edge<n>`, `<id>----note-<n>` | `data-id` (the state id, `edge<n>`, `<composite>:region<k>`, the note's `note:<k>`) and `data-ast` (`n:A`, `s:X`, `r:X#1`, `e:A>B`, `note:1`) | Ids are global in a page; `data-ast` maps an element to its source (R-PARSE-8) |
| `<defs>` with `<marker id="…-barbEnd">` (unified), `dependencyEnd` (old), `marker-end="url(#…)"`; drop-shadow `<filter>`s under the neo look | Arrowheads are `<path class="marker">` in each transition's group, the flowchart's point arrowhead with the theme's `arrowhead*` geometry; the shadow is the `dropShadow` CSS filter, no `<filter>` | No `<defs>` or ids (D35); state reads as one family with flowchart (R-THEME-11) |
| Labels: `<foreignObject>` HTML (unified) or `<text>` (old) | `<text>`/`<tspan>`; a word wider than `wrappingWidth` stays whole and the state grows to hold it, as the HTML did (the text output splits it) | No HTML mode (D5); #649 |
| State: `<g class="node statediagram-state" id>` with `<rect class="basic label-container">` and `<g class="label">` | `<g class="node statediagram-state …" data-id data-ast transform>` with a `<rect rx="5">` and a `<text>` | Fewer elements |
| Described state (`rectWithTitle`): `<rect class="outer title-state">`, `<line class="divider">`, two HTML labels; old: `state-title` text, `descr-divider` line, `state-description` text | `<rect>`, `<text class="state-title">`, `<line class="divider">`, `<text class="state-description">` | Text labels |
| Start: `<circle class="state-start">`; end: roughjs paths (`outer-path`), old renderer two circles `end-state-outer` / `end-state-inner` | Start `<circle class="state-start">`; end `<circle class="state-end">` (the ring) and `<circle class="end-state-inner">` (the dot) | Plain circles, no roughjs |
| Choice, fork and join: roughjs `<path>`s | `<polygon>` (choice) and `<rect class="fork-join">` | Plain shapes |
| The choice diamond drawn without a shadow, in every look | The choice carries the theme's drop shadow like other states | D188 |
| Composite (`roundedWithTitle`): `<g class="… statediagram-cluster" id data-look>` with `rect.outer`, `rect.inner` and an HTML `cluster-label`; old: `composit` / `alt-composit` rects and a `state-title` text | `<g class="statediagram-state statediagram-cluster [statediagram-cluster-alt] …" data-id data-ast>` with `rect.outer`, `rect.inner` and `<text class="cluster-label">` | Text labels; one element per composite |
| Concurrency region: a cluster `<g>` with a dashed `<rect class="divider">` filled `altBackground` (and the palette tint) around each region; old: a `<line class="divider">` per `--` node | Each region is `<g class="statediagram-state statediagram-cluster statediagram-region" data-ast="r:X#k">` with an `<rect class="region">` with no fill or stroke; between neighbouring regions the composite holds a dashed `<line class="divider">` from the layout's `dividers`, in the composite's border colour (plain `nodeBorder` under the neo gradient, where v12 dashed each region's frame with the gradient) | Regions read as one composite split in parts; the lines come from region geometry (#144). Unfilled, with dashed dividers only (D121, D185, D188) |
| Note: a `noteGroup` cluster around the note and its state, `<g class="node statediagram-note">` with a roughjs path | No note group; `<g class="node statediagram-note" data-ast="note:k">` with a `<rect>` | A note sits in its state's scope (#144) |
| Note edge: `<path class="transition note-edge …">`, dashed by CSS or the neo dash generator | `<g class="transition note-edge edge-thickness-normal edge-pattern-dashed" data-id>` with a `<path stroke-dasharray="5">`, no arrowhead and no `data-ast` (the note element carries the note's AST id) | One `data-ast` per AST node (R-PARSE-8) |
| Transition: `<path class="transition …" id>` in `edgePaths` | `<g class="transition edge-thickness-normal edge-pattern-solid" data-id data-ast>` holding the `<path>` and its arrowhead | One element per transition |
| Edge label: `<g class="edgeLabel">` with HTML, background at 50% opacity; old: `<g class="stateLabel">` with a `rect.box` | `<g class="edgeLabel" data-id>` with a tag: a `<rect rx="6">` filled opaque with `edgeLabelBackground` (the theme background), bordered 1 px in the transition's line colour, 8 px of room each side and 4 px above and below, then a `<text>` | As flowchart; edge labels are tags (D626–D629) |
| `click`: the node wrapped in `<a xlink:href target="_blank" title>` after drawing | `<a href target="_blank">` inside the node group (only URLs that pass `securityLevel`), tooltip as an SVG `<title>`; a composite is not linked (v12 searched `g.node` only) | No script in output (R-SVG-4, R-SVG-5) |
| `data-color-id` on composites and regions, coloured by `[data-color-id]` CSS rules: outline and title strip tinted, regions tinted | The same `data-color-id="color-<n>"`, slot per composite in declaration order, shared by its regions; a styled composite spends its slot unpainted. Colours are attributes; the region frames are not tinted (D121) | Palette from `borderColorArray` / `bkgColorArray` only, never a theme name (D152) |
| `classDef` / `style` as CSS (`.name > * { … !important }`), reaching the composite body but not its title strip | Presentation attributes after the allow-list (R-SEC-3), on a state's shape, on both of a composite's rects, and `color` on the label only | Unknown properties and unsafe values are dropped with a warning |
| Front-matter `title` drawn as `statediagramTitleText` | The same: 18 px in `textColor`, centred over the drawing, its baseline `state.titleTopMargin` (25) above it, the viewBox grown to hold it with 8 px around | One helper for every type (D652, replacing D122) |

Colours map to theme variables v13 already has (D152): states `mainBkg` / `nodeBorder` (v12
`stateBkg`, `stateBorder`), start, fork and join `lineColor` (v12 `specialStateColor`), the end
dot `nodeBorder` (v12 `innerEndBackground`), transitions `canvasLineColor` and `arrowheadColor`
(v12 `transitionColor`; under a `lineColor` override `default` and `dark` keep their transitions
`#333333` and `#d3d3d3`, as v12 did, D668), labels `textColor` on `edgeLabelBackground`, notes
`noteBkgColor` / `noteBorderColor` / `noteTextColor`. State text reads `stateLabelColor` and composite titles
`compositeTitleColor`, state's own variables (D638): in the classic themes both follow
`primaryTextColor`, as v12's `stateLabelColor` did, and setting `stateLabelColor` recolours both;
in the redux and neo themes they are `nodeTextColor` and `titleColor`. Under `default`, v12
ignored an author's `primaryTextColor` for state text; v13 applies it. Where v12's classic themes
used fixed values of their own (`neutral`'s black transitions and outlines and `#222` start dot,
`dark`'s `#f4f4f4` start dot, black arrowheads in `forest` and `neutral`), v13 draws the shared
variables above (D639, D668, D680). A composite's title band reads `compositeTitleBackground`, its body
`compositeBackground`, and a nested composite's body `altBackground`, with v12's values (D120,
D126, #193, #197; see the theme variable table). The composite outline radius is `radius`; the
state radius (5), the end-state stroke (2) and the dash patterns are the same in every v12 look,
so constants.

## Front matter and directives

Front matter (`---` … `---`) and `%%{init: …}%%` directives are read as in v12, without
rewriting the source: every position in an error refers to the text you wrote. The
differences, all checked against v12 over the e2e corpus:

- The first closing `---` line ends the front matter (v12's regex could close at a later one).
- A closing `---` at the end of the text without a final newline is accepted.
- Blank lines before the opening `---` are accepted (v12 `render()` rejected them; `run()`
  trimmed them).
- A byte order mark (U+FEFF) before the opening `---` is skipped, so the front matter's `title`
  and `config` apply. v12 drew the diagram but ignored the front matter (D642).
- `%%` comment lines and whole `%%{…}%%` directive lines before the opening `---` are skipped,
  so the front matter's `title` and `config` apply. v12 drew the diagram but ignored the front
  matter. A directive there still applies and wins over the front matter, as in v12 (D704, D705).
- YAML anchors are rejected, and `__proto__`/`constructor`/`prototype` keys are dropped with a
  warning. The error says that tags, anchors and aliases are not supported, also for an anchor
  on a key that holds a nested mapping (`base: &b` over indented keys).
- A `config` that is not a mapping is ignored with a `FRONT_MATTER_CONFIG` warning.
- One invalid directive (bad JSON) is dropped with `INVALID_DIRECTIVE`; v12 dropped all of
  them.
- An unclosed `%%{` is an error that ends at its line, instead of swallowing the rest of the
  text.
- Directive names match exactly: `%%{init: …}%%` and `%%{initialize: …}%%` set config,
  `%%{wrap}%%` sets `wrap: true`; v12 matched `init` anywhere in the name.
- An unclosed front matter block is an error pointing at the opening `---`.

The legacy top-level `displayMode` in front matter still moves to `gantt.displayMode`.

## Flowchart SVG structure

What changed in the flowchart's SVG compared with v12, and why (DESIGN §7.2). Group class names
(`clusters`, `edgePaths`, `edgeLabels`, `nodes`, `node`, `cluster`, `flowchart-link`,
`edge-thickness-*`, `edge-pattern-*`, user `classDef` classes) are kept so selectors that use
them keep working.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="flowchart"`, `role="graphics-document document"`, `aria-roledescription="flowchart-v2"` | No root `id`; `class="mermaid mermaid-flowchart"`, `role="img"`, `aria-roledescription="flowchart"`, `data-mermaid-version` | The only ids are `<id>-title` and `<id>-desc` (R-A11Y-1), so two diagrams in one page never collide |
| `<style>` element with the theme's CSS, scoped by the root id | No `<style>` (except the custom-property sheet of `theme: 'auto'`); colours are presentation attributes reading `var(--_x)` aliases declared on the root `style` | Output is inert by construction (R-SEC-2); hosts re-theme with `--mermaid-*` (R-THEME-3) |
| `<g class="root">` wrapper, `<defs>` and `<marker>` elements, `marker-end="url(#…)"` | Root children are the four groups; arrowheads are `<path class="marker">`/`<circle class="marker">` inside each edge's group | No `<defs>` or ids needed (D35); markers take the edge's colour |
| Element ids: nodes `flowchart-A-0`, edges `L_A_B_0`, clusters by subgraph id | `data-id` (the v12 node, edge or subgraph id) and `data-ast` (the AST id, e.g. `n:A`, `e:A>B`, `s:one`) | Ids are global in a page; `data-ast` maps an element back to its source (R-PARSE-8) |
| Edge: `<path class="flowchart-link …" id>` directly in `edgePaths` | `<g class="edge flowchart-link edge-thickness-normal edge-pattern-solid …" data-id data-ast>` holding the `<path>` and its markers; an invisible edge is an empty group | One element per edge carries its id and markers |
| Labels: `<foreignObject>` with HTML (`span.nodeLabel`, `span.edgeLabel`, `div.labelBkg`) | `<text>`/`<tspan>` | No HTML mode (D5); labels measure deterministically (R-TEXT-4) |
| Node: `<g class="node default …" id>` with `<rect class="basic label-container">` and `<g class="label">` | `<g class="node default …" data-id data-ast transform>` with the shape elements and one `<text>`; no `label-container`/`label` classes | Fewer elements; shapes are plain outlines |
| Cluster: `<g class="cluster" id>` with `<rect>` and `<g class="cluster-label">` | `<g class="cluster" data-id data-ast>` with `<rect>` and `<text class="cluster-label">` | Text labels |
| Edge label: `<g class="edgeLabel"><g class="label">…foreignObject…`, its background `edgeLabelBackground` (80% alpha in `default`) with no border | `<g class="edgeLabel" data-id>` with a tag: a `<rect rx="6">` with 8 px of room each side of the text and 4 px above and below, filled opaque with `edgeLabelBackground` (the theme background unless set), bordered 1 px solid in the edge's stroke (a `linkStyle`, class or `style` stroke, else `lineColor`) (still 1 px and solid on thick, dotted and dashed edges), then a `<text>`; one box around a label of several lines, none for an empty one. Edges reserve the matching room (`labelPatch` 16 × 8) | Text labels; edge labels are tags (D626–D629) |
| Collapsed subgraph: a node drawn by the cluster code | `<g class="node cluster collapsed" data-ast="s:<id>">` | It is drawn as a node with its subgraph's AST id |
| `style`/`classDef`/`linkStyle` as a `style` attribute | Presentation attributes (`fill`, `stroke`, …) after the allow-list (R-SEC-3) | Unknown properties and unsafe values are dropped with a warning |
| A font list in `style`/`classDef` (`font-family:Georgia, Times New Roman, serif`) split at each comma into `font-family:Georgia;Times New Roman;serif`, so only `Georgia` was kept | The whole list is kept. The statement still takes no parentheses, as in v12, so `rgb(…)` is a parse error there | D706, #1312 |
| `click A "url"` wraps the node in `<a xlink:href>`; tooltips are an HTML hover div | `<a href>` inside the node group (only URLs that pass `securityLevel`); tooltips are an SVG `<title>`; `click … callback` draws nothing (interactions plugin) | No script in output (R-SVG-4, R-SVG-5) |
| `viewBox` may start at negative coordinates | `viewBox="0 0 w h"` | Layout places the drawing at the origin |
| `nodeSpacing`/`rankSpacing` below the arrowhead: a subgraph level used its parent's `nodesep` and `ranksep + 25`, so frames were never drawn as tight as asked | Spacing is literal, except a rank gap is never smaller than an arrowhead plus its 6 px lead (13 px classic, 19.5 px neo), so the edge between two subgraphs stays visible | D601, #399 |
| Icon shape frames (`form` `square`, `rounded`, `circle`): the glyph plus `flowchart.padding` (63 px around a 48 px icon), rounded corners 5; a circle as wide as the glyph's diagonal plus 40, about 108 px | The glyph plus half of `flowchart.padding` (55.5 px), rounded corners 5; a circle as wide as the glyph's diagonal plus half of `flowchart.padding`, about 75 px. The label sits 8 px from the frame, as in v12 | Tighter frames (D685, #1150) |
| `flowchart.curve` was the only curve key, and the resolved config (`getConfig()`) showed its default | A top-level `curve` sets the curve of every diagram type that draws edges, and `swimlane.curve` that of a swimlane diagram. A flowchart takes a per-edge curve, then `flowchart.curve`, then `curve`, then `rounded`; a swimlane diagram takes `swimlane.curve`, set in any source, before `flowchart.curve`, and a flowchart with `layout: swimlane` ignores `swimlane.curve` (D761). `rounded` is now a default in code, so `getConfig()`, the config reference and the editor hover show no default for `flowchart.curve`. Drawing with nothing set is unchanged | One `curve` for every type, and a key without a default is unset only when the author did not set it (D733, #1377) |
| A markdown string (`` "`…`" ``) in a node, edge or subgraph label drew a `\n` written as two characters as text | It breaks the line there, as `<br>` does and as a written `\n` does in every other flowchart label. Markdown is still read only in a markdown string: `**x**`, `_x_` and a label wholly in backticks without quotes (`` `**x**` ``) are drawn as written, as in v12, and give one `MARKDOWN_NOT_READ` warning. `markdownAlwaysOn: true` draws every label as markdown | #1368, #1395 |
| A label written in shape data (`a@{ label: "…" }`) with no `labelType` was read as markdown: `a@{ label: "**x**" }` drew bold, and `` a@{ label: "a `code` b" } `` drew a code span | It follows the label rule. The value is plain text unless it is a markdown string (`` a@{ label: "`**x**`" } ``, single quotes too), read as markdown without its backticks; `**x**`, `_x_` and a code span are drawn as written and give one `MARKDOWN_NOT_READ` warning, the tags draw, and a `\n` written as two characters (`'one\ntwo'`; inside double quotes YAML already makes it a line break) breaks the line. A written `labelType` is read as before (`markdown` reads the value as markdown). `markdownAlwaysOn: true` draws it as markdown. The same holds in swimlane diagrams | #1368, #1432 |

## Sequence SVG structure

What changed in the sequence diagram's SVG compared with v12 (spec #125, DESIGN §7.2). The
v12 element classes (`actor`, `actor-top`, `actor-bottom`, `actor-man`, `actor-box`,
`actor-line`, `messageLine0`, `messageLine1`, `messageText`, `sequenceNumber`, `note`,
`noteText`, `loopLine`, `labelBox`, `labelText`, `loopText`, `sectionTitle`, `activation0`–`2`,
`rect`) are kept so selectors that use them keep working.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `aria-roledescription="sequence"`, a `<style>` scoped by the id | No root `id`; `class="mermaid mermaid-sequence"`, `role="img"`, `aria-roledescription="sequence"`, `data-mermaid-version`; colours are presentation attributes reading `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| `<defs>` with `<marker>`s (`-arrowhead`, `-filled-head`, `-crosshead`, `-sequencenumber`, the half-arrow heads, `-filled-head-control`) and `<filter id="…-drop-shadow">`; `marker-end="url(#…)"` on lines | No `<defs>`. Arrowheads are `<polygon class="arrowhead">` / `<polyline class="arrowhead">` in the message's group, at v12's marker size and anchor; the sequence number is a `<circle class="sequenceNumberCircle">` and its `<text class="sequenceNumber">`; the control symbol's head is a `<polygon>`; the shadow is a `filter` CSS value from `dropShadow` | No ids needed; heads take the message colour |
| Async (`-)`), half-arrow and stick heads were black in every theme (no CSS reached their markers); the cross head was themed | Every head is drawn in `signalColor` | v12's black heads did not read on the dark themes (D131) |
| The sequence number in `font-family="sans-serif"` | The number takes the diagram font, like every other label; badge size and text sizes (12, 9, 7) as in v12 | Fonts are uniform across diagrams |
| v12 classic themes gave boxes their own grey drop shadow (`g rect.rect { filter: dropShadow }`). The rule never reached `rect` blocks, which sat directly under the `<svg>`: they had no stroke and no shadow in any theme | No shadow in the classic themes: boxes take `dropShadow` only where the theme sets it (the redux themes). `rect` blocks have no stroke and no shadow, as in v12, and one written without a colour is filled with `rectBkgColor` (v12's per-theme default: `tertiaryColor`, or the background darkened 4 in neo, redux and redux-color) | One shadow variable per theme (D152, D131); #774 |
| A fragment title that is empty once read (`loop </style>`) | Not drawn, as v12 skipped it | v13 drew `[]` before the fix |
| A `rect` colour CSS does not know (`rect redd`) went into `fill`, which browsers drew in the inherited text colour | Dropped with `STYLE_VALUE_DROPPED`; the block is filled with `rectBkgColor` | D690, #1195 |
| A refused per-key font family (`sequence.actorFontFamily: "x;color:red"`) went into the inline style | Dropped with `STYLE_VALUE_DROPPED`; the label is measured and drawn in the Mermaid font | Inert output (R-SEC-3) |
| Participants: a lifeline `<line id="actorN" class="actor-line 200" name>` in one group, the top box in another, the bottom box drawn later; `data-et`, `data-type`, `data-id="<name>"`, `name` attributes; `id="root-N"` for menus | One `<g class="participant participant-<kind>" data-id="<id>" data-ast="p:<id>">` per participant holding its `<line class="actor-line">`, `<g class="actor-top">` and `<g class="actor-bottom">`; no `name`, `data-et` or `data-type` | One element per participant maps it to its source (R-PARSE-8) |
| Lifelines ran to `y2="2000"` and were cut by the viewBox | A lifeline ends at the bottom row (or where the participant is destroyed) | The layout places it (#141) |
| Messages: `<text class="messageText">` and `<line>`/`<path>` as siblings, `data-et="message"`, `data-id="i<n>"`, `data-from`, `data-to` | `<g class="message" data-id data-ast="m:<from>><to>#<n>">` holding the label, the line or self-loop path, the heads, central-connection circles and the number | One element per message (R-PARSE-8) |
| Notes, frames: `<g data-et="note">` or `<g data-et="control-structure">`, `data-id="i<n>"` | Notes in `<g class="notes">`, each `<g class="note-<placement>" data-id data-ast="note:<n>">`; frames in `<g class="fragments">`, each `<g class="fragment fragment-<kind>" data-id data-ast="f:<kind>#<n>">` with a `<g class="loopSection" data-ast>` per `else`/`and`/`option` | Same |
| Activations, `rect` blocks and boxes: unclassed groups, appended where the draw loop met them | `<g class="activations">`, painted in start order so an inner bar covers its outer one (each bar has `data-ast` of its `activate` line; a bar opened by `+` or `()` has the message's id as `data-id` and no `data-ast`), `<g class="rects">`, `<g class="boxes">` (each `<g class="box" data-ast="box:<n>">`) | Stacking order is fixed: boxes, rects, participants, activations, frames, notes, messages |
| Text: `<text>` with a `<tspan>` per line and a `style="font-…"` from `sequence.*Font*` | `<text>`/`<tspan>`; a section whose per-key font differs from the Mermaid font writes `font-family`/`font-size`/`font-weight` on its group (`participants`, `messages`, `fragments`, `notes`) | Labels are drawn in the font they were measured in |
| Title: an unclassed `<text>` at a fixed place; box labels `class="text"` in default black | `<text class="sequenceTitle">` centred above the drawing; box labels in `textColor` | Theme colour on every text |
| The `redux-color` / `redux-dark-color` names switched per-participant colour; `look: neo` switched the corner radius (6 / 3), the actor, note and label tab shadow | The palette (`borderColorArray`, `bkgColorArray`, `data-color-id="color-<n>"` on the participant and its activations), `actorRadius` and `dropShadow` theme variables. Boxes take the shadow only where the theme has one (see above); `rect` blocks take none | D152 |
| Bottom symbols of the figure kinds sat a few px off the top ones (`isFooter` offsets) | The bottom symbol is drawn like the top one | One drawing per kind |
| v12's `look: neo` geometry: the band model of `actorBands.ts` (rows as tall as glyph band 44 + 6 + label + 6, one lifeline start per row, the symbols on the band, the stick figure scaled to it, the database cylinder as tall as it, a `collections` stack 6 shorter), messages 3 px shorter, label tabs 15 px taller, 30 px more below the drawing | The same geometry in the redux themes and v12 classic geometry in the classic themes, from the `actorGlyphBand`, `messageEndGap`, `labelBoxExtraHeight` and `actorFooterPadding` theme variables (see "Theme geometry"), so any theme can take either. Text output draws every symbol as a box and ignores them (#194) | D152 |
| A front-matter `title` was drawn above the diagram like a `title` statement | The same: drawn as a `title` statement when the text has none; a `title` statement wins. It does not feed the accessible name: only `accTitle` does (D133) | D218, D652 |
| `actor`/`link` popup menus (`actorPopupMenu`, `onclick`) | Not drawn by the renderer; the interactions plugin adds them | No script in output (R-SVG-4) |
| Labels broke at `<br>` only; a `\n` written as two characters was drawn | The same: a written `\n` is text in participant, message, note and block labels (it broke the line in earlier v13 alphas) | D564, #763 |
| A message's text as separate `<text>` elements with `dominant-baseline="middle"` and `dy="1em"`, its last baseline about 11 px above the line at 16 px | One `<text>` on alphabetic baselines, placed so the last baseline sits `messageFontSize + boxMargin − 10 − wrapPadding / 2` above the line (11 px at the defaults). A label that would cut the message's `autonumber` circle (a self message's) moves up to 2 px above it; v12 drew it over the circle. A label that would reach below its line (a large `wrapPadding`, a small message font, a `rightAngles` self message) moves up until it ends on the line; v12 drew the line through it. Lines stay where they were, and so do rows and the diagram height, except where a label lifted over its number would rise above its row (a message font under about 12 px with `rightAngles`): that row grows by the difference. Earlier v13 alphas drew the text about 11 px higher | D723, #1237 |
| A frame's title and section labels (`else`, `and`, `option`) with their first baseline `boxMargin + boxTextMargin + boxTextMargin / 2` below the frame's top line or the section's dashed line (18 px at the defaults) | The same, 17.5 px at the defaults. Frames, tabs, section lines and the diagram height are unchanged. Earlier v13 alphas drew the text about 12 px lower | D723, #1238 |
| A wrapped message wrapped at `max(span + 2·wrapPadding, width)`, so its longest lines ran past both lifelines (by up to 47 px in Chromium, more than v12 measured, because v12 measured the text in Times) | A wrapped message between neighbouring participants wraps at `span − 2·wrapPadding` and stays between their lifelines with every `messageAlign`; a long label gets more lines and its row grows. A word wider than that room is not broken: it keeps a line of its own and may reach past it. A self message and a message across several columns keep v12's rule. A deliberate divergence from v12 | D724, #1239 |
| A frame's label tab fixed at `labelBoxWidth` (50 px); a keyword wider than that (`critical` at 16 px in the classic themes) ran out of the tab | The tab grows to hold its keyword, and the frame and its title follow it: the frame is at least the title's width plus the tab's, and the title is centred right of the tab, so it never overlaps the tab. A frame is wider than v12's only by what its tab is wider than 50 px (at most about 10.6 px, for `critical` at 16 px, whose tab is 60.6 px wide; none at the redux themes' 14 px). Earlier v13 alphas sized the frame for a 50 px tab, so a long `critical` title overlapped the tab by about 10 px. Text output is unchanged | D734, #1361 |

The `data-ast` ids are built from the names as written (R-PARSE-8): `p:<id>` for a participant
(its later mentions `p:<id>@2`, `@3`, …), `m:<from>><to>` for the first message between two
participants and `m:<from>><to>#2`, `#3`, … for the next ones, `note:<n>`, `f:<kind>#<n>`,
`box:<n>` and `st:<n>` for the rest. Inside a name `%`, `>`, `@` and `#` are percent-encoded
(`%25`, `%3E`, `%40`, `%23`), so the suffixes stay unambiguous; spaces and other characters are
kept. So `participant A B` is `p:A B`, `participant A#c` is `p:A%23c`, the first `A->>B#2` is
`m:A>B%232` (no suffix: it is the first message from `A` to `B#2`), and the second `A->>B` is
`m:A>B#2`.

## Class diagram SVG structure

What changed in the class diagram's SVG compared with v12's unified renderer
(`classRenderer-v3-unified`), and why (DESIGN §7.2, spec #126). The root, `<style>`, marker,
id and label rows of [Flowchart SVG structure](#flowchart-svg-structure) apply as they are; the
rows below are class-specific. Group class names (`clusters`, `edgePaths`, `edgeLabels`,
`nodes`, `node`, `cluster`, `relation`, `edge-pattern-*`, `edgeTerminals`, `outer-path`,
`divider`, user `cssClass` / `:::` classes) are kept.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id`, `class="classDiagram"`, `role="graphics-document document"` | No root `id`; `class="mermaid mermaid-class"`, `role="img"`; `aria-roledescription="classDiagram"` is kept | R-A11Y-1, as for flowcharts |
| Class `<g class="node default …" id="classId-A-0">` holding a rough.js `<g class="basic label-container outer-path"><path>`, `annotation-group`, `label-group`, `members-group` and `methods-group` groups of `<foreignObject>` labels, and `<g class="divider"><path>` | `<g class="node default …" data-id="A" data-ast="n:A" data-color-id transform>` holding `<rect class="outer-path">`, `<text class="annotation">`, `<text class="title">`, one `<path class="divider">` per compartment, and one `<text class="member attribute">` / `<text class="member method">` per member with `data-id="A#k"` and `data-ast="m:A#k"` | Text labels (D5); each member maps back to its source line (R-PARSE-8). Every `data-id` is the raw name (`B#2`, `B#2#1`); only `data-ast` escapes it (`n:B%232`, `m:B%232#1`) |
| Static (`$`) and abstract (`*`) members styled by CSS on the HTML label | `text-decoration="underline"` and `font-style="italic"` on the member's inner `<tspan>` | No style sheet (R-SEC-2) |
| Relationship `<path class="edge-thickness-normal edge-pattern-solid relation" id="id_A_B_1" marker-start/-end="url(#…)">` | `<g class="edge relation edge-thickness-normal edge-pattern-solid" data-id="id_A_B_1" data-ast="e:A>B">` holding the `<path>` and its markers; `..` is `edge-pattern-dashed`; a lollipop relationship also has class `lollipop`. The classes are kept, `edge-thickness-normal` included | One element per relationship carries its ids and markers |
| Each relationship part had its own id scheme (the path `id_A_B_1`, the labels none) | The line, its label and its multiplicities all carry `data-id="id_A_B_1"` (v12's edge id); only the line's group carries `data-ast` | One id per relationship for hosts and `plugin-interactions` |
| `<marker>` elements `…-aggregationEnd`, `-extensionEnd`, `-compositionEnd`, `-dependencyEnd`, `-lollipopEnd`, and their `-margin` variants under `look: neo` | Inline `<path class="marker aggregation">` (and `extension`, `composition`, `dependency`) and `<circle class="marker lollipop">`. The classic themes draw v12's classic markers, the redux themes its neo `-margin` ones (a shorter inheritance triangle, the tip gaps, 2px outlines on hollow markers and none on filled ones), through the class marker variables in [Theme geometry](#theme-geometry). Each marker is narrowed by its outline so that it stays 12px across outline included, and multiplicities stay clear of it | D35, D152 |
| Note edge `edgeNote<k>`, dotted | `<g class="edge relation edge-thickness-normal edge-pattern-dotted" data-id="edgeNote<k>">`, no `data-ast`: the note's AST id is on its box | One `data-ast` element per AST node (R-PARSE-8) |
| Relationship label `<g class="edgeLabel">` with HTML on `mainBkg` (`.labelBkg`; the `.edgeLabel[data-look="neo"]` rule never matched, as v12 sets `data-look` on the path only) | `<g class="edgeLabel" data-id>` with a tag: a `<rect rx="6">` with 8 px of room each side of the text and 4 px above and below, filled opaque with `classEdgeLabelBackground` (`edgeLabelBackground` unless set, itself the theme `background` unless set; either recolours the tags and not the canvas, `edgeLabelBackground` in every diagram type, `classEdgeLabelBackground` in class only), bordered 1 px solid in `lineColor` (still 1 px and solid on dashed relations), then a `<text>` in `classEdgeLabelColor`: `textColor` where it reads on the tag (4.5:1), else black or white, whichever reads better. v12 drew relation labels in `classText`, so in the classic themes, where `classText` is `primaryTextColor`, the label ink changes: default #131300 → #333333, dark #e0dfdf → #cccccc, forest #321b67 → #000000, neutral #111111 → #000000. One box around a label of several lines, none for an empty one. The multiplicities at the ends stay plain text | Text labels; edge labels are tags (D626–D629); readable ink on the tag (D713, D715, #1327) |
| Multiplicities: one `<g class="edgeTerminals">` per end, HTML at 11px | One `<g class="edgeTerminals" data-id>` per relationship holding a `<text>` per end, at `classTerminalFontSize` (11px in every theme), measured at that size by the layout | Text labels |
| Class text coloured by `classText` through the `<style>` (`.nodeLabel`, `.edgeLabel`, `.label text`) | `classText` is a theme variable and colours names, annotations, members, multiplicities and interface names; relationship labels sit on a tag and take `classEdgeLabelColor` (above); notes keep `noteTextColor` and namespace titles `titleColor`. On a box an author `style` fills, the text switches to black or white as in flowcharts | R-THEME-12 |
| Note: `<g class="node …">` with the rough.js note shape | `<g class="node note" data-id="note0" data-ast="note:k">` with `<rect class="outer-path">` (`noteBkgColor`, `noteBorderColor`) and the text, left-aligned | Text labels |
| Lollipop interface: a node with an invisible (`opacity: 0`) rect and its label | `<g class="node interface" data-id="interface0" data-ast="i:Name">` holding only the text | Nothing invisible is drawn |
| Namespace: `<g class="cluster" id>` with `<rect>` and an HTML label | `<g class="cluster namespace" data-id="<qualified id>" data-ast="s:<id>">` with `<rect>` and `<text class="cluster-label">`. A namespace made only as the ancestor of a dotted one (`X` of `namespace X.Y`) has no `namespace` statement of its own, so it has no `data-ast` | Text labels; one `data-ast` per AST node (R-PARSE-8) |
| Per-class colour through `[data-look][data-color-id].node .outer-path` rules in the `<style>` | `data-color-id` is kept; the colours are presentation attributes on the box and its dividers; an author `style` / `classDef` still wins | No style sheet |
| A `classDef`'s styles were copied into the `style` of each class that already had that CSS class when the `classDef` line was read, and drawn inline on its box. A class given the CSS class after the `classDef` (`class Cat:::pet`, `cssClass "Cat" pet`) got the class name but no styles, and v12 wrote no `.pet` rule, so it was drawn unstyled | The `classDef` styles of every CSS class of the class, then its own `style`, as presentation attributes after the allow-list, whatever the order of the lines: a class given the CSS class after the `classDef` is styled too | Unknown properties and unsafe values are dropped with a warning (R-SEC-3) |
| A comma inside a `style` / `classDef` value split it: `fill:rgb(255, 200, 200)` lost the colour and `font-family:Georgia, serif` kept only `Georgia`, without a warning | The whole value is kept: `rgb()`, `hsl()` and font lists work | D706, #1312 |
| Under `look: neo` (the redux family, `neo`, `neo-dark`), the `[data-look=neo]` rules beat a `style` / `classDef` fill and stroke on a class box | `style` and `classDef` fill and stroke on a class box take effect in every theme | D187, D152 |
| Class ids, labels and member text passed through `sanitizeText` (DOMPurify), so `A : +List<T> items` lost `<T>` | Text is escaped when written, never sanitised: `+List<T> items` is shown as written, and only the tags of the label subset are read as tags ([Labels and text](#labels-and-text)). A generic written with `~` is always drawn as written, as in v12, also when its type is named like a tag: `B~U~` draws `B<U>` and `+List~Data~ items` draws `+List<Data> items` | R-SEC-1; the flowchart's rule; D619 |
| `link` / `click … href` as `<a xlink:href>`; tooltip as an HTML hover div; `callback` / `click … call` bound with `bindFunctions` | `<a href target>` inside the node group (URLs that pass `securityLevel`); the tooltip is an SVG `<title>`; callbacks draw nothing (interactions plugin) | R-SVG-4, R-SVG-5 |
| Front-matter `title` drawn above the diagram (`classDiagramTitleText`) | The same: centred over the drawing in the root's font and `textColor` (v12's `.classTitleText` rule never matched it), its baseline `class.titleTopMargin` (25) above it, the viewBox grown to hold it with 8 px around | One helper for every type (D652) |
| Names, annotations, members, notes and relation labels read as Markdown without backticks; multiplicities and namespace titles drawn as plain text | The same: bold and italic are read in box rows, notes and relation labels; a text that starts with `- `, `* ` or `+ ` is drawn as written, and so is a code span (backticks and what they hold), with bold and italic outside it still read; multiplicities, namespace titles and lollipop interface names are plain. An unknown `#name;` is drawn as written, where v12 drew `&name;` | D564, D610, D561, #763, #836 |
| Relationships drawn with `flowchart.curve` (`rounded` by default here) | The same curves, through the new `class.curve`, then the new top-level `curve`, then `rounded`. `flowchart.curve` is not read: a class diagram that set it sets `class.curve` instead. Nothing set draws as before; a self-loop is always `rounded`. Text output stays stepped | One key per type (D733, #1378) |

## ER SVG structure

What changed in the ER diagram's SVG compared with v12 (DESIGN §7.2, #133). The groups are the
flowchart's (`clusters`, `edgePaths`, `edgeLabels`, `nodes`), and v12's ER class names are kept
where the element still exists (`node default <classDef>`, `outer-path`, `row-rect-odd`,
`row-rect-even`, `name`, `attribute-type`, `attribute-name`, `attribute-keys`,
`attribute-comment`, `divider`, `relationshipLine`, `edge-pattern-solid`/`-dashed`, `cluster`).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="erDiagram"`, `aria-roledescription="er"`, a `<style>` element | No root `id`; `class="mermaid mermaid-er erDiagram"`, `role="img"`, `aria-roledescription="er"`, `data-mermaid-version`; no `<style>`, colours are presentation attributes reading `var(--_x)` aliases | Only `<id>-title` and `<id>-desc` ids (R-A11Y-1); inert output (R-SEC-2) |
| Entity `<g class="node default" id="entity-<name>-<n>">` | `<g class="node default …" data-id="<name>" data-ast="n:<name>" transform>` | `data-ast` maps the entity to its first mention (R-PARSE-8) |
| Table drawn with rough.js paths: `g.outer-path`, `g.row-rect-odd/even` (one per row, empty of text), one `path.divider` polygon per rule, and `g.label` groups holding `<foreignObject>` or `<text>` | `<rect class="outer-path">`; one `<g class="row-rect-odd\|even" data-id="<attribute>" data-ast="a:<entity>.<attribute>">` per attribute row holding its fill `<rect>` and its cells as `<text class="attribute-type">` (and `-name`, `-keys`, `-comment`); one `<path class="divider">` with the outline and every rule; `<text class="name">` | One element per attribute row carries its AST id; text labels only (D5) |
| Entity without attributes: `drawRect` with `rect.basic.label-container` | `<rect class="outer-path">` and `<text class="name">` | Same structure as a table |
| Entity outline 1.3px (rough.js default) in classic looks, `strokeWidth` in neo | `strokeWidth` (1 classic, 2 redux) for outline, rules, lines and ends | Theme tokens (R-THEME-11), D117 |
| `style` / `classDef` fill: classic looks keep the theme fill on odd rows, neo fills every row | The author's fill fills the whole table in every theme; its stroke styles the outline and every rule | One rule for every theme (D152), D117 |
| Edge `<path class="… relationshipLine" id="id_<from entity id>_<to entity id>_<n>" marker-start marker-end>` with `<marker>` elements in `<defs>`: `CUSTOMER \|\|--o{ ORDER` is `id_entity-CUSTOMER-0_entity-ORDER-1_0` | `<g class="edge relationshipLine edge-thickness-normal edge-pattern-solid\|dashed" data-id="id_<from name>_<to name>_<n>" data-ast="e:<a>><b>">` holding the line `<path>` and one `<g class="marker onlyOne\|zeroOrOne\|oneOrMore\|zeroOrMore">` per end (a `<path>`, plus a `<circle>` for a zero end): the same edge is `id_CUSTOMER_ORDER_0` | No `<defs>` or ids (D35); ends take the line colour. The `data-id` uses the entity names, as `data-id` does on entities; v12's entity ids are gone |
| Crow's foot: a lens marker half covered by the entity box | Only the visible half is drawn, from the outline to the toe 18px out | Same picture without relying on paint order |
| `md_parent` end (`u`): no marker | No marker (unchanged) | |
| Edge label `<g class="edgeLabel">` with `<foreignObject>` (`span.edgeLabel`, `div.labelBkg`), on `tertiaryColor` at half opacity in the classic themes | `<g class="edgeLabel" data-id>` with a tag: a `<rect rx="6">` with 8 px of room each side of the text and 4 px above and below, filled opaque with `erEdgeLabelBackground` (the theme background unless set), bordered 1 px solid in the relationship line's colour (`lineColor`) (still 1 px and solid on non-identifying, dashed lines), then a `<text>`; one box around a label of several lines, none for an empty one; the corners are rounded too | Text labels; labels carry no `data-ast`; edge labels are tags (D626–D629) |
| Relationship labels drawn and measured at 14 px in every theme and look (`.edgeLabel .label { font-size: 14px }`, a rule no other type has) | Drawn and measured at the theme's `fontSize`, like every other label: 16 px with no override, and an author's `themeVariables.fontSize` moves them too, so the label boxes and the layout are larger than v12's | Fonts behave the same in every diagram type (D665) |
| Subgraph `<g class="cluster" id>` with `<g class="cluster-label">` | `<g class="cluster …" data-id="<name>" data-ast="s:<name>">` with `<rect>` and `<text class="cluster-label">` | |
| Front-matter `title` drawn as `text.erDiagramTitleText` | The same: centred over the drawing in the root's font and `textColor`, its baseline `er.titleTopMargin` (25) above it, the viewBox grown to hold it with 8 px around | One helper for every type (D652) |
| Hand-drawn look: background copies of every entity (`<id>-background`) | None (`look` is removed, D153) | |
| Markdown emphasis in a label (`"This **is** _Markdown_"`, `*Alias*`, `__rel__`): `<strong>`/`<em>` in the `<foreignObject>`, or `<tspan font-weight="bold">`/`font-style="italic"` without HTML labels | `<tspan font-weight="bold">` and `<tspan font-style="italic">` runs inside the label's `<text>`, in every ER label: entity names and aliases, attribute types, names, keys and comments, relationship labels and subgraph titles. The markers are not drawn; text output drops them. An underscore inside a word (`order_item`) is text. Backticks, a leading `- ` and backslashes are drawn as written | Same formatting as v12 (#754, D565) |
| A `#name;` with a name the browser did not know drew `&name;` | Drawn as written (`#bogus;`), as in every type | D561, D565 |

## User journey

### Layout

- **Sizing (D242):** at the default config every element sits where v12 put it (bands at y 50,
  tasks at y 110, faces at `300 + (5 − score) × 30`, legend rows from y 60). The SVG is sized
  to what is drawn plus `diagramMarginX`/`diagramMarginY` on each side (D224). v12 counted
  `leftMargin` twice in the width, took `diagramMarginX` as a task's width in its bounds and
  as the gap between section bands, fixed the height at 450 px and the view box top at −25
  (+70 for a title), and ended the activity line at `width − leftMargin − 4`. Section bands
  are now `taskMargin` apart, as tasks are.
- **Legend margin (D242):** `leftMargin` widens by exactly what the widest legend line needs.
  v12 widened only once a legend line passed `leftMargin / 2`, jumping from 150 to about
  230 px.
- **Section fills (D241):** sections cycle over all eight `fillType0`–`fillType7`, so an
  eighth section takes `fillType7` and a ninth `fillType0`. v12 cycled over seven (the length
  of `sectionFills`, read once at module load), so `fillType7` never showed although the redux
  themes tune eight. `sectionFills` is removed and warns `CONFIG_REMOVED_KEY` (D708): v12's
  `fillType<n>` style rules hid it in every theme anyway. Set `fillType0`–`fillType7` instead.
- **The empty actor (D244):** a trailing comma (`Task: 5: Me,`) still adds the actor `''` to
  the model, but it is not drawn: no legend row, no dot, no colour. v12 drew a nameless row
  and dot, and as `''` sorts first it took the first colour and shifted every other actor's.
- **Legend order:** the legend lists actors in the model's order (sorted by code unit), and
  colours follow the same order. v12 gave colours in sorted order but walked the actor
  object's keys for the legend, so integer-like names (`1`, `42`) came first there.
- **Actor names with entities:** a name written with a `#…;` entity (`#lt;b#gt;`, held as
  `&lt;b&gt;`) sorts by that text, so before plain names. v12 sorted the placeholder its
  entity encoding left in the name, after plain names. Only such names' legend order and
  colour slots change (#302).
- **Legend wrapping (D225):** a legend name wider than `maxLabelWidth` wraps with core label
  layout, and a word too long for a line splits without the hyphen v12 added at each split.
- **Tall labels (D615):** a title broken by `<br>` keeps its last line on v12's baseline (y 25)
  and grows upward, so it stays above the section bands. A section name taller than its band
  grows the band down and moves the task row down by as much. A task name taller than its box
  grows the box, and the activity line and the faces move down by the band's growth plus the
  tallest box's. v12 printed `<br>` as written and clipped names to their box, so nothing grew.
  When every label fits its box, everything stays where v12 put it.

### Config

- **Honoured:** `diagramMarginX`, `diagramMarginY`, `leftMargin`, `maxLabelWidth`, `width`,
  `height`, `taskMargin`, `boxTextMargin`, `taskFontSize`, `taskFontFamily`, `actorColours`,
  `titleColor`, `titleFontFamily`, `titleFontSize`, `useMaxWidth` and `sectionColours`.
  Unset, `taskFontSize`, `taskFontFamily` and `titleFontFamily` follow the theme font, as in
  every diagram type (D132, D248), and `sectionColours` leaves names in `textColor` (D225).
- **Ignored**, accepted without a warning: `noteMargin`, `messageMargin`, `messageAlign`,
  `bottomMarginAdj`, `rightAngles`, `activationWidth` and `useWidth` (v12's journey renderer
  never read them), `boxMargin` (read only in a loop over an empty list), `textPlacement`
  (every label is SVG text, D225).
- **Removed**, with a `CONFIG_REMOVED_KEY` warning: `sectionFills` (D241, D708). The theme's
  `fillType0`–`fillType7` fill the sections.
- **`actorColours` replaces the defaults:** an author's list is the whole palette, cycling
  from the first actor. v12 appended the author's colours after its six defaults (`#8FBC8F`,
  `#7CFC00`, `#00FFFF`, `#20B2AA`, `#B0E0E6`, `#FFFFE0`), so they reached only the seventh
  actor on. Unset, the six defaults apply as before.
- **Lengths are checked:** a length key (`diagramMarginX`, `diagramMarginY`, `leftMargin`,
  `maxLabelWidth`, `width`, `height`, `taskMargin`, `boxTextMargin`) that is not a number from
  0 to 10000 px keeps its default, with one `JOURNEY_CONFIG` warning per key. v12 used any
  value as it was.
- **Per-diagram values now apply:** v12 read `sectionFills` and `sectionColours` once at
  module load, so a front-matter or directive value never reached the drawing; a
  `sectionColours` set there now colours the names.
- **Text output:** `format: 'ascii'` is not available for journeys; it throws
  `UnsupportedFormatError` and `supportsFormat('journey', 'ascii')` is `false` (D216).

### Themes

- `fillType0`–`fillType7` are each theme's v12 values. v12 derived them from `primaryColor`
  and `secondaryColor` with hue turns of ±64° and 128°, so a custom `primaryColor` recoloured
  every section. The classic themes (`default`, `dark`, `forest`, `neutral`, `base`) keep
  those rules, so an override recolours the sections as in v12 (D656). The redux and neo
  themes write their values as fixed colours, which an override of a base colour does not
  move. Set `fillType<n>` to recolour a section.
- `faceColor` is `#FFF8DC` in every theme (v12's fallback; no v12 theme set it).
- `actor0`–`actor5` have no theme value: dots take `journey.actorColours` in every theme,
  redux included, and an author's `actor<n>` wins for n < 6 (D249).

## Journey SVG structure

What changed in the user journey's SVG compared with v12 (spec #290, D240–D249). The v12
element classes (`journey-section`, `section-type-<n>`, `task`, `task-type-<n>`, `task-line`,
`face`, `mouth`, `actor-<n>`, `legend`) are kept so selectors that use them keep working; the
section and task classes now sit on the group that holds the box and its label.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id, `viewBox="<x> -25 <width> <height + 70 with a title>"`, `preserveAspectRatio="xMinYMin meet"` and a `height` of the view box plus 25 | No root `id`; `class="mermaid mermaid-journey"`, `role="img"`, `aria-roledescription="journey"`, `data-mermaid-version`; the `viewBox` is what is drawn plus `diagramMarginX`/`diagramMarginY` on each side; `width="100%"` and `max-width`, or `width` and `height` with `useMaxWidth: false`; no `preserveAspectRatio` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), the bounding box covers what is drawn (D224, D242) |
| `<defs><marker id="<id>-arrowhead">` and `marker-end` on the activity line; the head black in every theme | No `<defs>`. `<g class="activity">` holds `<line class="activity-line">` and `<path class="arrowhead">`, both in `textColor` | No ids; the head takes its line's colour (D245) |
| Task lines `<line id="<id>-task<n>">` | `<line class="task-line">`, no id | Only `<id>-title` and `<id>-desc` ids remain |
| A section: an unclassed `<g>` with `<rect class="journey-section section-type-<n>">` and its label (a `<switch><foreignObject>` by default) with the same classes | `<g class="journey-section section-type-<n>" data-id="s:<name>" data-ast="s:<name>">` holding the `<rect>` and `<text class="section-label" data-id>`. A rule on `.section-type-<n>` now matches the group: write `.section-type-<n> > rect` for the box | One element per section maps it to its source (R-PARSE-8) |
| A `section` line with no tasks, or a repeated name that continues the run before it, drew nothing | Still no band; an empty `<g class="journey-section empty" data-id data-ast>` stands for the line | One `data-ast` element per AST node |
| A task: an unclassed `<g>` with the line, the face, an unclassed `<g>` of eyes and mouth, `<rect class="task task-type-<n>">`, the actor dots and a label of class `task` | `<g class="task task-type-<n>" data-id="t:<n>" data-ast="t:<n>">` holding, in v12's paint order, `<line class="task-line">`, `<circle class="face">`, two `<circle class="eye">`, `<path class="mouth mouth-smile\|mouth-sad\|mouth-flat">`, the `<rect>`, a `<circle class="actor-<n>" data-id="a:<name>" data-ast="a:<name>">` per named actor mention (`data-id` the legend entry's; its `<title>`, as v12, the name as the legend shows it: entities decoded, a `<br>` a space) and `<text class="task-label" data-id>` | Same |
| Mouth: a d3 `arc` path moved by `transform`; a score of 3 or `NaN` a `<line class="mouth">` | An absolute `<path>` for every mouth, no `transform`; v12's shapes and its rule on the score as written | No d3 (R-PERF-2) |
| Faces at `300 + (5 − score) × 30` for any score; `NaN` wrote `cy="NaN"` | `NaN` is drawn at 3 and other scores clamped to 0–5, with one `JOURNEY_SCORE` warning per render | D226 |
| Legend: `<circle class="actor-<n>">` and `<text class="legend"><tspan>` siblings at the root, one row per actor including `''`, which took the first colour | `<g class="legend-entries">` with one `<g class="legend-entry" data-id="a:<name>">` per named actor, holding the `<circle class="actor-<n>">` and `<text class="legend">`; no `data-ast` (the task dots carry the mentions' ids). `''` draws nothing and takes no colour | D244 |
| Labels: an HTML `<div>` in `<foreignObject>` (`textPlacement: fo`) or `<tspan>`s, `<br>` literal in the HTML and a hyphen at each split word in the legend | `<text>`/`<tspan>` from core's label layout: task names wrap to the task, section names to the band, legend names to `maxLabelWidth`, `<br>` breaks; `textPlacement` is ignored. A legend name splits a long word without a hyphen. A task or section name keeps a word wider than its box whole, as v12 did, and the box widens to hold it where v12 let it run out: a task is as wide as its widest line and the tasks after it move along, a section shares its extra width out among its tasks. A name taller than its box grows the box down, and the rows below it move down by as much | D225, D558, D615 |
| Colours from the `<style>`: `.task-type-<n>, .section-type-<n> { fill: fillType<n> }` (every rule gated on `fillType0`), `line { stroke: textColor }`, `.face { fill: faceColor or #FFF8DC; stroke: #999 }`, `.legend { fill: textColor }`, `.actor-<n> { fill: actor<n> }`; `#666` outlines, eyes and mouth, `#000` dot outlines | Presentation attributes: band and task fills from `fillType<slot>`, lines, arrowhead, legend and names from `textColor`, the face from `faceColor`, dots from `journey.actorColours` unless the author sets `actor<n>` (n < 6); `#666`, `#999` and `#000` stay constants in every theme | No style sheet (R-SEC-2); D152, D245, D249 |
| `sectionColours` reached the `tspan` fallback only (the default `fo` label ignored it) | Colours section and task names, by band, when set; otherwise names are `textColor` | D225 |
| Title: an unclassed bold `<text>` at (`leftMargin`, 25) with `fill="<titleColor>"` (default empty: black on dark themes) and `font-family="<titleFontFamily>"` | `<text class="journey-title">` at the same place (a title of several lines ends on that baseline and grows upward), bold, `4ex` of the theme `fontSize` by default, in `titleColor` or else `textColor`; `titleFontFamily` inherits the Mermaid font when unset | D248, D615 |
| Task text in `taskFontSize`/`taskFontFamily` (defaults 14 and Open Sans) via an inline `style` | Unset, both follow the theme font; when set, `font-family`/`font-size` are written on the `sections` and `tasks` groups | Fonts are uniform across diagrams (D132) |
| A `journey.titleColor`, `actorColours` or `sectionColours` value that is not a colour, a misspelt one included (`redd`, drawn in the inherited text colour), went into the markup | Dropped with `STYLE_VALUE_DROPPED`; the default colour is used: the title's and a section's `textColor`, an actor's built-in colour. The other entries of the list keep their places | Inert output (R-SEC-3), D690 |

The `data-ast` ids come from the source (R-PARSE-8): `s:<name>` for a section line (a repeat
of a name `s:<name>@2`, `@3`, …), `t:<n>` for the n-th task, counting from 1, and
`a:<name>` for a task's dot, the first mention of that actor (a later one `a:<name>@2`, …).
Legend entries carry `data-id="a:<name>"` only.

## Timeline config

- **SVG only:** `timeline`, `timeline LR` and `timeline TD` are detected by v12's case-sensitive
  `timeline` detector, after `flowchart-v2` and before `gitGraph`. `format: 'ascii'` throws
  `UnsupportedFormatError` (D216).
- **Honoured** in the `timeline` section, with v12's effective values when unset (v12's renderer
  with its default config merged): `leftMargin` (150), `padding` (no schema default; 50, v12's
  fallback), `useMaxWidth` (true) and `disableMulticolor` (false). The top-level `fontSize` (no
  schema default since D620; 16 when unset, as in v12) is read as v12's timeline read it: each box is `0.55 × fontSize` taller than its text, and the
  TD axis starts `2 × fontSize` above the content and ends `0.5 × fontSize + 20` below it. The
  text itself is drawn at `themeVariables.fontSize`, as in v12. A `leftMargin`, `padding` or
  `fontSize` that is not a number of at least 0 is replaced by its default, with a
  `TIMELINE_CONFIG_IGNORED` warning naming the key.
- **Ignored**, as v12's timeline never read them (keys copied from the sequence config):
  `diagramMarginX`, `diagramMarginY`, `width`, `height`, `boxMargin`, `boxTextMargin`,
  `noteMargin`, `messageMargin`, `messageAlign`, `bottomMarginAdj`, `rightAngles`,
  `taskFontSize`, `taskFontFamily`, `taskMargin`, `activationWidth`, `textPlacement`,
  `actorColours`, `sectionColours` and `useWidth`. Box colours come from the `cScale`,
  `cScaleInv` and `cScaleLabel` palettes or `mainBkg` / `nodeBorder` (D258).
- **Removed**, with a `CONFIG_REMOVED_KEY` warning: `sectionFills` (D708). v12's timeline never
  read it either. Box fills come from the `cScale<n>` theme variables in the classic themes,
  otherwise from `mainBkg` or the `borderColorArray` palette (D227, D257).
- **`cScale<n>`, `cScaleLabel<n>` and `cScaleInv<n>` overrides** recolour a timeline only in the
  classic themes (`default`, `base`, `dark`, `forest`, `neutral`). They change nothing in the
  redux themes, the default `redux-color` included, or under `theme: 'auto'` (which is
  `redux-color` and `dark`); in `neo` and `neo-dark` only `cScaleLabel` counts (box text, and
  slot 11 for the axis and connectors). This follows v12's redux and neo timeline paint (D227,
  D257), but v12's default theme was `default`, so a v12 diagram that set them without a `theme`
  needs `theme: 'default'` to keep its colours.

## Mindmap

- **SVG only:** `mindmap` is detected by v12's case-sensitive `mindmap` detector, second after
  `flowchart-elk` as in v12, where it shipped only in the large-feature build. `format: 'ascii'`
  throws `UnsupportedFormatError` (D216). The language service, CodeMirror and Monaco know it.
  For `renderSync`, `preload({ types: ['mindmap'] })` (or `prepare()`) also loads the `tree`
  engine; `layouts` is needed only for another engine, such as an `elk.*` one.
- **Syntax** is v12's: a differential test runs v12 and v13 over every e2e fixture and the v12
  spec and docs examples, and the grammar is in [syntax/mindmap.md](./syntax/mindmap.md). Every
  error is reported, not only the first, with messages in words (R-PARSE-4). A second root
  (`There can be only one root …`) and an `::icon()` or `:::` line before any node are errors,
  as in v12 (the second was a `TypeError` there). v12 also rejects a node right after a blank
  line under the `mindmap` line (`mindmap`, a blank line, then `root`), and after some runs
  where a comment line sits between blank lines (a blank line, `%%`, a blank line, then the
  node); v13 rejects exactly the same texts, and the message says to remove a blank line. Other
  blank and comment lines, two or more in a row included, are accepted as in v12.
- **Layout.** v12 laid mindmaps out with `cose-bilkent`, force-directed and different on every
  render, or with `tidy-tree` when that plugin was registered. v13 uses `tree`, core's two-sided
  tidy tree, so positions differ from both and are the same on every render ([Layout](#layout)):
  the root sits in the middle, the first branches go right and the rest left, split where the
  two sides' heights are closest (D283), and each side keeps source order. Siblings are 20 px
  apart and each level 40 px further out, tidy-tree's gaps; the root's own extra clearance in
  tidy-tree is not reproduced. Cloud and bang nodes are laid out at the box their outline covers.
  With `layout: layered` (or `dagre`) or an installed `elk.*` the same tree is drawn top-down.
- **Config.** Honoured in the `mindmap` section, with v12's defaults: `colorBy` (`branch`; eleven
  sections, as v12), `padding` (10), `maxNodeWidth` (200) and `useMaxWidth` (true). `padding`
  reaches what v12's renderer let it reach (D287): the margin round the drawing and default,
  cloud and bang nodes in every theme, and in the classic themes circles too, and hexagons twice
  over. In the redux family, `neo` and `neo-dark` circles and hexagons take the theme's
  `circlePadding` and `hexagonPaddingX` / `hexagonPaddingY` instead
  ([Theme geometry](#theme-geometry)). Square and rounded nodes keep their own paddings (v12's
  fixed 10 and 15 in the classic themes). v12 meant circles to have a fixed 10, but its check
  never matched, so `padding` sized classic circles there too and does here. `maxNodeWidth` wraps every shape (D287, D769), at 200 unless set, and is clamped
  to 120 to 1200 with a `MINDMAP_CONFIG_IGNORED` warning when it is outside that range.
  **Deliberate divergence from v12.3:** square, rounded and hexagon nodes wrapped at
  `flowchart.wrappingWidth` (120 by default) only because v12 drew them with the shared
  flowchart shape code; v13 wraps them at `maxNodeWidth` like the other shapes, so a long label
  in one of them wraps at 200 px, not 120, and the node is wider and shorter than in v12, and
  mindmap never reads `flowchart.wrappingWidth`. A `padding` below 0, a
  `maxNodeWidth` of 0 or less or a value that
  is not a number lays out with the default and warns `MINDMAP_CONFIG_IGNORED`; numeric strings
  (`"20"`, not `"20px"`) are read as numbers, as in v12. `useWidth` and `layoutAlgorithm` are ignored (v12 never
  read them), and `look` is ignored as everywhere (D153), except that `look: handDrawn` sketches
  the mindmap when `@mermaid-js/plugin-hand-drawn` is installed
  ([Hand-drawn look](#hand-drawn-look)). `mindmap.layout` picks the engine for mindmaps and wins
  over the top-level `layout`, with the same names and fallbacks.
- **Hand-drawn colours in the classic themes.** v12 sketched mindmap's shaped nodes (all but the
  plain one, D308) in its generic sketch paints: a `mainBkg` hachure and a `nodeBorder` outline.
  The section colour reached the sketch only through mindmap's `.section-<n>` fill rule, which
  also matched roughjs's paths, so how much of it showed depended on the shape: circles looked
  solid in the section colour, cloud and bang nodes showed it around their edge, and square,
  rounded and hexagon nodes did not show it at all. v13 hachures every shape in the section's
  `cScale` colour (the root's is `git0`, D307) and keeps v12's `nodeBorder` outline, which the
  hand-drawn plugin adds (D693); the plain node is sketched too, with its rule and no outline, as
  v12 drew it. Themes with outlined mindmap nodes (the redux and neo families) keep their own
  outline in the sketch (#1243, #1256).
- **Labels** are SVG text, measured in the theme's font, instead of HTML in `<foreignObject>`
  ([Mindmap SVG structure](#mindmap-svg-structure)). As in v12, every label reads bold, italic
  and `<br>` line breaks without backticks, and a label that starts with `- `, `* ` or `+ ` is
  drawn as written (D564, #763). A code span (``[`a **b**`]``) is drawn as written, backticks
  included, and bold and italic outside it are still read (D610, #836). Only a markdown string
  (`` "`…`" ``) has bullet lists and inline code, which v12 did not draw (D56). A written `\n`
  is text. A word wider than `maxNodeWidth` stays
  whole and the node grows to hold it, as v12's HTML labels did (#649).
- **The default shape per theme family** is a theme flag, not a theme-name check (D288): plain
  nodes are rounded in the redux family and drawn as v12's `defaultMindmapNode` elsewhere, flat
  at the bottom in `neo` and `neo-dark` ([Theme geometry](#theme-geometry)).
- **Edge widths** follow v12's `edge-depth-<d>` CSS, from the raw indent rather than the tree
  depth, so with two-space indents classic edges are 11, 5 and 3 px wide
  ([Mindmap SVG structure](#mindmap-svg-structure)).
- **Limits** (R-SEC-5): a mindmap may have up to `limits.maxNodes` nodes (10,000) and nest up to
  `limits.maxDepth` levels below the root (100); over either, render rejects with a `LIMIT`
  `MermaidError`. v12 had no such limit. Only the integrator can raise them
  ([Limits](#limits)).

## Mindmap SVG structure

What changed in the mindmap's SVG compared with v12 12.2.0 (`mindmapRenderer.ts` through the
shared `rendering-util` shapes and edges, `styles.ts`), and why (DESIGN §7.2, spec #294). v12's
class names are kept where the element still exists: `mindmap-node`, `section-<n>`,
`section-root`, `node-bkg`, `edge`, `section-edge-<n>`, `edge-depth-<d>`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="mindmapDiagram"`, a `<style>` scoped by the id; colours from CSS rules per section | No root `id`; `class="mermaid mermaid-mindmap"`, `role="img"`, `aria-roledescription="mindmap"`, `data-mermaid-version`; colours are presentation attributes, theme variables as `var(--_x)` aliases and palette slots as literal colours | Inert output (R-SEC-2), D152 |
| Node `<g id="node_<n>" class="mindmap-node section-<n>" data-look>` placed by `transform`, the shape inside with `id`; edges in `g.edgePaths`, nodes in `g.nodes` | `<g class="mindmap-node section-<n> <author classes>" data-id="n:<id>" data-ast="n:<id>">` (the root `section-root section--1`), coordinates absolute, no `transform`, no ids, no `data-look`; edges in `g.mindmap-edges` under nodes in `g.mindmap-nodes`. An edge is `<path class="edge section-edge-<n> edge-depth-<d>" data-id="edge:n:<child>">` | One element per node maps it to its source (R-PARSE-8, D289); D308 |
| Labels in `<foreignObject>` HTML (`htmlLabels`), every label markdown | `<text class="mindmap-node-label">` with a `<tspan>` per line from core's label layout; markdown kept (bold, italic, line breaks, D225) | No `foreignObject` (R-SEC-2) |
| `edge-depth-<d>` from the parent's raw indent plus 1 (two-space indents give 1, 3, 5 …); widths from CSS: classic `17 − 3i`, so 11, 8, 5, 2 and 3 px from class 5 on (the browser drops the negative ones), neo `max(10 − 2d, 2)` | The same class numbering and widths, written as `stroke-width` on each edge; with two-space indents classic edges are 11, 5 and 3 px wide, not 11, 8, 5 | P2: author CSS for `edge-depth-<d>` keeps matching (GAPS #388) |
| Edges `curve: 'basis'` through cose-bilkent's three points, or tidy-tree's elbows | `tree`'s port-to-port routes as one cubic leaving and entering along the ports; `layered` and ELK routes as the basis spline through their points | D280–D282 |
| A plain node: `defaultMindmapNode` (four rounded corners, flat bottom under `look: neo`) with a `line.node-line-` rule, except `rounded` when the theme name had `redux` | The `mindmapRoundedNodes` and `mindmapOutlinedNodes` theme flags ([Theme geometry](#theme-geometry)); the rule is `line.node-line-<n>` in `cScaleInv<n>`, not drawn under the gradient | D288, D152 |
| The `line.node-line-<n>` rule under a plain node 3 px wide in `default` only: `base`, `dark`, `forest` and `neutral` set `useGradient`, and `genGradient` writes `stroke-width: 0` for the rule in every look | The rule in all five classic themes, with or without an override: their `useGradient` is off, since in v13 it draws gradient outlines, which v12 drew only under neo. A host stylesheet can set `stroke-width: 0` on `line[class^="node-line-"]` to drop it | D663, D182 |
| Neo nodes in `[data-look="neo"]` rules by theme name (`redux`, `redux-dark`, `neutral`, `neo-dark`, `includes('redux')`); `filter: url(#<id>-drop-shadow)` on the node's group | The flags and `borderColorArray` decide (`redux` and `redux-dark` carry none); the shadow is the `dropShadow` CSS filter on the shape, so labels are not shadowed. `neutral` is a classic theme, so v12's neo-only `neutral` label rule has nothing to apply to | D152, D153, D227 |
| Under `useGradient` a second `<linearGradient id="<id>-gradient">`, a duplicate id | One scoped gradient (D182) | Unique ids |
| `::icon()` parsed and not drawn (the shapes never read `node.icon`) | The slot v12's older renderer reserved (D297); with the icons plugin the glyph, 40 px, in the label's colour (`g.mindmap-icon`); otherwise, or in neither D297 form, the reference as written, smaller to fit 40 px (`text.mindmap-icon`), with one `ICON_NOT_RENDERED` | D286, D291, D297 |
| No hand-drawn sketch of the plain node | Every outline and edge goes through the outline hook, the plain node too | D302, D308, D309 |

## Timeline SVG structure

What changed in the timeline's SVG compared with v12's `timelineRenderer.ts` (LR) and
`timelineRendererVertical.ts` (TD), and why (DESIGN §7.2, spec #291). v12's class names are kept
where the element still exists: `timeline-node`, `section-<n>`, `node-bkg`, `node-line-<n>`,
`taskWrapper`, `eventWrapper`, `lineWrapper`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id; no `role`; `accTitle` / `accDescr` parsed but never written (the DB had no `getAccTitle`) | No root `id`; `class="mermaid mermaid-timeline"`, `role="img"`, `aria-roledescription="timeline"`, `data-mermaid-version`; colours are presentation attributes reading `var(--_x)` aliases. `accTitle` and `accDescr` give `<title id="<id>-title">` and `<desc id="<id>-desc">` with `aria-labelledby` / `aria-describedby` | Inert output (R-SEC-2), only the title and description ids (R-A11Y-1) |
| An empty first `<g>`; sections in an unclassed `<g transform>`; boxes placed by `transform` | No empty group. A section is `<g class="timeline-node section-<n>" data-id="sec:<k>" data-ast="sec:<k>">`; a period `<g class="taskWrapper" data-id data-ast="per:<k>">` and an event `<g class="eventWrapper" data-id data-ast="ev:<p>.<k>">`, each holding its `timeline-node` group. Coordinates are absolute, no `transform` | One element per section, period and event maps it to its source (R-PARSE-8) |
| Box path `id="<id>-node-<n>"` (TD `undefined-node-<n>`), `class="node-bkg node-undefined"` | `<path class="node-bkg">`, no id | No ids; `node.type` was never set |
| The class of slot *n* is `section-<n mod 12 − 1>`, so the first section is `section--1` | Kept as is, so author CSS written for v12 still matches | P2 |
| Label `<text dy="1em" dominant-baseline="middle">` wrapped by `getComputedTextLength`; only lowercase `<br>` breaks | `<text data-id>` with a `<tspan>` per line from core's label layout. Every `<br>` form breaks and entities decode (D225); tags and markdown strings follow the label rule (D711, next row). Labels carry `data-id` only. Box labels are drawn at the theme's `fontWeight` (600 in the redux themes, as v12's redux CSS did) | D225, R-PARSE-8 |
| Labels were drawn with d3's `.text()`: `<b>bold</b>`, `<i>`, `<u>` and a markdown string (`` "`**bold**`" ``) showed their tags and backticks as characters | Labels follow the label rule of every type. `<b>`/`<strong>`, `<i>`/`<em>`, `<u>`/`<ins>`, `<s>`/`<strike>`/`<del>`, `<sub>` and `<sup>` draw their formatting without the tags; any other tag is drawn as written text (#1440). A label wholly in backticks is a markdown string, drawn as Markdown without its backticks; `**x**` without backticks stays as written, and `List<T>` stays text. A tag escaped by its author (`#lt;b#gt;`) still shows as written. A label with neither is drawn as before | D710, D711 |
| A word wider than its box (v12 wrapped at white space only) ran out of the box | The word stays whole and the box widens by what it needs: LR, its column, with the columns after it moved along; TD, a period to the left (the axis stays), an event or a section to the right. Boxes without such a word keep v12's widths | D558, #649 |
| `<marker id="<id>-arrowhead">` and `marker-end` on the axis and the connectors; TD referred to `url(#arrowhead)`, which did not exist, so it drew none; the marker was always black | Inline `<path class="arrowhead">` at v12's marker size and place, in the line's colour, in both directions | D253; no `<defs>` or ids |
| Axis and connectors `stroke="black"` overridden by `.lineWrapper line`: `cScaleLabel11` (classic) or `nodeBorder` at `strokeWidth` (redux) | The same paint as attributes. A connector's `lineWrapper` carries the `data-id` of its period (LR) or event (TD), no `data-ast` | |
| `.eventWrapper { filter: brightness(120%) }` | The event's colours are computed at 120% brightness (a gradient outline stays as it is). Under `theme: 'auto'` a theme variable an event reads keeps its CSS variable unbrightened, so it still switches with the page, except on a palette fill (next row); a page that overrides `--mermaid-mainBkg` or `--mermaid-nodeBorder` in CSS changes periods but not events | `brightness()` is not an allowed `filter` value (R-SEC-2) |
| Redux geometry, paint and shadow chosen by `theme.includes('redux')`; the `<filter id="<id>-drop-shadow">` written only under `look: neo` (its opacity 0.2 white on the dark redux themes) | The `timelineRadius`, `timelineLabelOffset`, `timelineEventLabelShift` and `timelineScaleColors` theme variables ([Theme geometry](#theme-geometry)) and the shared `dropShadow` CSS filter, in every look: the dark redux themes' shadow is white at 6%, as everywhere else | D152, D153 |
| `redux-color` filled each box with its `borderColorArray` slot; `redux-dark-color` with `mainBkg` | Kept: the border slot fills where `bkgColorArray` is non-empty, else `mainBkg`; the outline takes the slot in both, and the box carries `data-color-id="color-<n>"`. A palette slot is a literal colour, under `theme: 'auto'` the light theme's, so the text and rule drawn on a palette fill are that theme's literal colours too and the pair never switches separately with the page | D257, D151 |
| A redux theme with `useGradient` turned on | `redux-color` and `redux-dark-color` keep the palette slot as the outline (a palette slot wins over the gradient, as in every diagram); `redux` and `redux-dark` outline with the gradient at `strokeWidth` | theming.md |
| `theme: neo` (and 12.2.0's default `look: neo`): classic geometry, `mainBkg` fill and gradient outlines through `[data-look=neo]` rules; the rule under each box stroked with the gradient, which a zero-height line can't show; TD wrote no gradient defs, so its gradient paint pointed at nothing | `neo` and `neo-dark` keep classic geometry and colours (no shadow), fill `mainBkg` and outline with the gradient at 2px in both directions; the rule is drawn in plain `nodeBorder` at 2px | D227, D182, D185 |
| Periods before the first section were never drawn, and two sections with one name each drew both groups | Periods are grouped by section position: leading periods are drawn first with no section box, in slot 0; each section draws its own periods | D251 |
| A period over about 150px tall put its events on the axis (events started 200px below the period top) | Events start at v12's place or 50px below the axis, whichever is lower | D252 |
| `maxTaskHeight` was always one line (v12 measured `[object Object]`), so only a tall period grew | Every period takes the height of the tallest, and the axis follows it | #337 |
| TD: the next section started 30px above the end of the previous section's last row, so full rows overlapped | A TD section starts at v12's place or 30px below what the previous group's rows hold, whichever is lower; most sectioned TD input moves down | No overlaps (#337) |
| TD: the axis started `2 × fontSize` above the content, through a title wider than about 285px | The axis starts below the title when the title spans it | #337 |
| Title an unclassed `<text>` in the root's `textColor`, `font-size="4ex"`, bold, at `bbox.width / 2 − leftMargin` (LR under `look: neo`: `bbox.x × 2 + leftMargin`); a front-matter `title` was dropped | `<text class="timeline-title">` in `textColor`, bold, at the px size of `4ex` the layout measured, left-aligned at the classic place in every theme. The `title` statement and a front-matter `title` are both drawn there: a non-empty in-text `title` wins, and a blank one (`title` and spaces) falls back to the front-matter `title`. A title taller than one 16px line moves the content down | D218, D254, D225 |
| LR: the axis ended at `width + 3 × leftMargin`, short of the last period below a `leftMargin` of 25 | The axis ends there or at the last period's right edge, whichever is further; the default `leftMargin` (150) draws as v12 | #337 |
| `timeline.useMaxWidth` fell back to `false` in the renderer, but v12's default config set it to `true` | Unchanged by default: `true` sets `width="100%"` and `max-width`; `false` writes the drawing's width and height. `leftMargin` (150), `padding` (50 when unset) and `disableMulticolor` likewise take v12's effective values, and the top-level `fontSize` still adds `0.55 × fontSize` to each box and sets the TD axis ends while the text is drawn at `themeVariables.fontSize`. The keys v12's timeline never read are ignored ([Removed, moved and ignored keys](#removed-moved-and-ignored-keys)) | #315 |

## Info diagram

The info parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; grammar in [syntax/info.md](./syntax/info.md)). An info diagram still draws one line,
the version. The differences:

- **The version** is `v` and the version of the `mermaid` package that renders it
  (`v13.0.0-alpha.1`), the same value as the root's `data-mermaid-version`. v12's `-tiny`
  suffix is gone: v13 has no tiny build.
- **`showInfo`** is accepted and draws nothing extra, as in v12, with no warning.
- **`title`**, in the text or the front matter, is drawn nowhere, as in v12 (D218).
  **`accTitle` and `accDescr`**, which v12 parsed and then ignored, now give the SVG its
  `<title>` and `<desc>` (D133).
- **Error messages** are new, as for flowchart, and every error is reported, not only the first.
- **`format: 'ascii'`** draws the same one line, `v13.0.0-alpha.1`, in both charsets. v12 had no
  text output.
- **Theme.** Info has no theme variables of its own. The line takes the shared `textColor` and
  `fontFamily`, as v12's root style gave it.

## Info SVG structure

What changed in the info diagram's SVG compared with v12 (#420, DESIGN §7.2). The v12 class name
`version` is kept.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="info"`, `width="100%"` and `style="max-width: 400px;"`, no `viewBox` | No root `id`; `class="mermaid mermaid-info"`, `role="img"`, `aria-roledescription="info"`, `data-mermaid-version`; `viewBox="0 0 400 100"`, grown to hold the version text, and `max-width` its width | Inert output (R-SEC-2), no colliding ids (R-A11Y-1). Without a `viewBox` v12's SVG was 150 px high whatever its width, and a version longer than `v12.2.0` ran past its left edge |
| `<g><text x="100" y="40" class="version" font-size="32" style="text-anchor: middle;">` | `<text class="version" data-ast="info" x="100" y="40" font-size="32" text-anchor="middle" fill>`, no `<g>` | Presentation attributes (no style sheet); `data-ast` maps the line to the `info` statement (R-PARSE-8) |
| The text colour from the root `<style>` (`textColor`) | `fill` reads the `textColor` alias on the root `style` | Host re-theming with `--mermaid-*` (R-THEME-3) |
| No `<title>` or `<desc>`: `accTitle` and `accDescr` were parsed and dropped | `<title>` and `<desc>` from `accTitle` and `accDescr` | D133 |

## Pie chart

The pie parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; grammar in [syntax/pie.md](./syntax/pie.md)). The differences:

- **Error messages** are new, as for flowchart, and every error is reported, not only the
  first. A negative value is still an error, with v12's message.
- **A repeated label (D226)** keeps its first value, as v12 did silently; v13 adds one
  `PIE_DUPLICATE_SLICE` warning for it. Nothing is ever drawn at NaN: a pie with no sections, or
  whose values sum to 0, draws its outer circle and legend only. A value too large for a number
  (309 digits or more), which v12 drew as `Infinity` and NaN, leaves its section out with a
  `PIE_VALUE_TOO_LARGE` warning, and values whose sum is past the largest number still share
  the pie as smaller ones would.
- **The front-matter `title`** is drawn as the chart title when the text has none (D218), as
  v12 did.
- **Labels (D225)** go through core's label layout: `<br>` breaks the line, markdown strings and
  entities render ([Pie SVG structure](#pie-svg-structure)). A markdown string is written as in
  flowcharts, `` "`**bold** text`" ``, in a section label or the title. A legend row of several
  lines is as tall as its label, and a title of several lines grows up from where v12 drew its
  one line, so neither runs into the pie or the next row; one-line labels sit where v12 put them.
- **Theme variables.** `pie1`–`pie12`, `pieTitleTextSize`, `pieTitleTextColor`,
  `pieSectionTextSize`, `pieSectionTextColor`, `pieLegendTextSize`, `pieLegendTextColor`,
  `pieStrokeColor`, `pieStrokeWidth`, `pieOuterStrokeColor`, `pieOuterStrokeWidth` and
  `pieOpacity` keep v12's names and each theme's v12 12.2.0 values
  ([theme-variables.md](./theme-variables.md)). The classic themes respond to an override of
  a base colour as v12's do (D656): `default` keeps all twelve slots, as v12 computed them before
  the override; `forest` and `base` recompute all twelve, hue turns included; `dark` and
  `neutral` keep their `cScale` values. In the redux and neo themes, slots v12 derives by
  lightness alone follow the theme's base colours and hue-turned slots are fixed values; a
  `cScale<n>` override recolours the slot that reads it, as in v12 (D334).
  `pieOpacity` is a number from 0 to 1 (D221) or a percentage from `0%` to `100%`, read as
  N/100 as CSS reads it (D707); any other value is dropped with `THEME_VARIABLE_DROPPED`.
- **`dark` slot 12 (D228):** `dark` and `neutral` keep v12's `cScale` offset (slice *n* takes
  `cScale`*n*, so the first slice is `cScale1`). v12 `dark` left `pie12` unset, so a twelfth
  slice drew black; it is now `cScale0`, as in `neutral`, so under `dark` a `primaryColor`
  override (which sets `cScale0`) also recolours the twelfth slice.
- **Rounding artefacts (D333(a)).** Where v12 stepped a slot from its unrounded HSL base colour,
  which lands a few steps off the hex one, v13 derives the slot from the theme's hex base colour
  by v12's own formula (`default` writes the result as a fixed value, which v12 keeps under an
  override):

  | Theme | Variable | v12 12.2.0 | v13 | Why |
  | --- | --- | --- | --- | --- |
  | `default` | `pie3` | `#b5ff20` | `#b9ff20` (`tertiaryColor` darkened 40) | D333(a) |
  | `default` | `pie6` | `#d7ff86` | `#d9ff86` (`tertiaryColor` darkened 20) | D333(a) |
  | `forest` | `pie6` | `#33b42f` | `#33b52e` (`tertiaryColor` turned 40°, darkened 40) | D333(a) |
  | `redux-dark` | `pie5` | `#2e3030` | `#2e2f2f` (`secondaryColor` darkened 10) | D333(a) |
  | `neo-dark` | `pie5` | `#2e3030` | `#2e2f2f` (`secondaryColor` darkened 10) | D333(a) |

- **`format: 'ascii'`** throws `UnsupportedFormatError`: pie has no text output (D216).

## Pie SVG structure

What changed in the pie chart's SVG compared with v12 (spec #288, DESIGN §7.2). The v12 class
names are kept (`pieOuterCircle`, `pieCircle`, `highlighted`, `highlightedOnHover`, `slice`,
`pieTitleText`, `legend`), so selectors that use them keep working.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `aria-roledescription="pie"`, `role="graphics-document document"`, a `<style>` scoped by the id | No root `id`; `class="mermaid mermaid-pie"`, `role="img"`, `aria-roledescription="pie"`, `data-mermaid-version`; colours, strokes, sizes and the opacity are presentation attributes on each element, colours reading `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| Everything in one `<g transform="translate(225,225)">`: the pie in an inner `<g>`, the title at `y=-200` and each legend row in it | The outer circle, slices and percentages in one `<g transform="translate(cx,cy)">` at the pie's centre; the title and the legend rows are siblings after it, in root coordinates | The layout places them; a `left` or `top` legend moves the pie, not the title |
| Percentages: `<text class="slice" transform="translate(x,y)" style="text-anchor: middle">` | `<text class="slice" data-id x y text-anchor="middle">` | No transform per label |
| Legend row: `<g class="legend" transform="translate(x,y)">` with `<rect style="fill;stroke">` at the origin and `<text x="22" y="14">` | `<g class="legend" data-id data-ast>` with `<rect x y width height fill stroke>` and a start-anchored `<text>`, both in root coordinates | One element per section maps it to its source (R-PARSE-8) |
| No source mapping; d3 bound each section as `__data__` | Each legend row carries `data-ast="slice:<label>"` (every section has a row, shown or not); its slice `<path>` and percentage `<text>` carry the same `data-id` only. A repeated label (`slice:<label>@2`) is not drawn and has no element | One `data-ast` element per AST node (R-PARSE-8, pitfall 12) |
| `highlightSlice: "<label>"`: class `highlighted`, and `scale: 1.05; opacity: 1` from the `<style>` | Class `highlighted` and `transform="scale(1.05,1.05)" opacity="1"` on that slice's path | No style sheet (D222) |
| `highlightSlice: "hover"`: class `highlightedOnHover` and a `:hover` rule that scaled the slice | Class `highlightedOnHover` on every slice, no hover effect, and one `PIE_HOVER_IGNORED` warning per render. Host CSS can target the class | No style sheet (D222); an interactions hover can come later |
| `highlightSlice: ""` (the default) highlighted a slice labelled `""` | Highlights nothing | v12 bug (#335) |
| Title and legend text set with d3 `.text()`: `<br>` and tags printed as written, entities decoded | Core's label layout ([Labels and text](#labels-and-text)): `<br>` breaks the line, `<b>`/`<i>` are drawn bold and italic, entities decode; a legend label of several lines stays left-aligned | D225 |
| The viewBox widened only for the title; many sections or a wide `top`/`bottom` legend were clipped | The viewBox covers everything drawn, and may start at a negative `x` or `y`. A `right`, `left`, `top` or `bottom` legend taller than the 450 px canvas (past 20 one-line rows) breaks into columns of the canvas height, and over a `left` legend in columns the title centres on the pie; a `center` legend stays one column | D224, D616 |
| `neo` and the redux themes: the same pie as the classic themes | The same: pie differs between families by colour only, with no gradient and no shadow | D227 |

## Packet diagram

The packet parser accepts the v12 language, `packet` and `packet-beta` (oracle parity over every
e2e fixture, the v12 spec strings and the syntax page; grammar in
[syntax/packet.md](./syntax/packet.md)). The differences:

- **Error messages** for syntax errors are new, as for flowchart, and every error is reported,
  not only the first.
- **Misplaced fields (D341).** A field that ends before it starts, leaves a gap or overlaps the
  previous one, or a `+0` field, gives v12's message as an error diagnostic on its bits, and
  parsing goes on: the count resumes from that field's own end (a reversed field from its
  start), so one misplaced field gives one error, not one per later field. The diagram is still
  rejected, as in v12, which stopped at the first.
- **Invalid config (D342).** A `rowHeight`, `bitWidth` or `bitsPerRow` below 1, a negative
  padding, a fractional `bitsPerRow` or a value that is not a number falls back to the default,
  with one `PACKET_CONFIG_INVALID` warning per key, where v12 drew fractional bit numbers,
  negative widths or nothing. A numeric string (`"8"`) counts as its number, as v12 drew it.
- **The 10,000-row cap (D342)** stays, now with one `PACKET_TRUNCATED` warning
  ([Packet SVG structure](#packet-svg-structure) gives its size at the default limits).
- **Labels and the title (D343, D344)** go through core's label layout and shrink to fit, and the
  bounding box covers them ([Packet SVG structure](#packet-svg-structure)).
- **Source mapping (D345).** Each field is the AST node `field:<start>-<end>`, from the range it
  resolves to, so its id survives a label edit; a `+N` field's id moves when an earlier field
  changes width.
- **`format: 'ascii'`** is new (v12 had no text output): the rows as one table of boxes, two
  columns a bit, labels cut to their field with `…`, the bit numbers above each row and the
  title below (D347; [ASCII output](ascii.md#packet-diagrams)).

### Packet theme colours

v12's packet style sheet read the ten keys of `themeVariables.packet` (`startByteColor` …
`blockFillColor`), but set in front matter or an `%%{init}%%` directive only four of them took
effect: `labelColor`, `labelFontSize`, `titleColor` and `titleFontSize`. v12 checks the config
from the diagram text with `sanitizeDirective`, which deletes every key that is not a key
somewhere in v12's default config. The other six (`byteFontSize`, `startByteColor`,
`endByteColor`, `blockStrokeColor`, `blockStrokeWidth`, `blockFillColor`) are not, so v12 dropped
them and drew the theme's values; `mermaid.initialize()` does not run that check. v13 keeps the
nested object and adds a flat name for each key (`packetStartByteColor` …
`packetBlockStrokeWidth`, CSS `--mermaid-packetStartByteColor`, …); the flat name wins when both
are set (D335, D540). An author's value wins in every theme for all ten keys, also in front
matter and directives, and a nested key leaves the others on the theme's values. The lengths
(10, 12 and 14 px, stroke 1) and the colours in `default`, `neutral`, `base`, `dark`, `neo`,
`redux` and `redux-color` are v12's. What changed
(`packages/conformance/src/packet/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `neo-dark` | No packet block: `styles.ts`'s literals, black bit numbers, labels, title and outlines on `#efefef` blocks, on a dark page | The dark entry, as `dark` draws: neo-dark's own `primaryTextColor` (`#e0dfdf`) for the five inks and its `background` (`#333333`) for the blocks; an override of either moves them | D333(b), R-THEME-11 |
| `redux-dark` | No packet block: `styles.ts`'s literals, black bit numbers, labels, title and outlines on `#efefef` blocks, on a dark page | The dark entry, as `dark` draws: redux-dark's own `primaryTextColor` (`#e0dfdf`) for the five inks and its `background` (`#333333`) for the blocks; an override of either moves them | D333(b), R-THEME-11 |
| `redux-dark-color` | No packet block: `styles.ts`'s literals, black bit numbers, labels, title and outlines on `#efefef` blocks, on a dark page | The dark entry, as `dark` draws: redux-dark-color's own `primaryTextColor` (`#e0dfdf`) for the five inks and its `background` (`#333333`) for the blocks; an override of either moves them | D333(b), R-THEME-11 |
| `forest` | Its own block: the five inks in `primaryTextColor` (`#321b67`), the blocks in `mainBkg` (`#cde498`), following an override of either | `default`'s black on `#efefef`, whatever forest's `primaryTextColor` and `mainBkg`. Set `themeVariables.packet` to draw v12 forest's | D541 |

## Packet SVG structure

What changed in the packet diagram's SVG compared with v12 (spec #421, DESIGN §7.2). v12's
structure and class names are kept: one `<g>` per row holding, per piece of a field,
`rect.packetBlock`, `text.packetLabel` and the `text.packetByte start` / `packetByte end` bit
numbers, then `text.packetTitle`, so selectors that use them keep working. Every position is
v12's.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="packet"`, a `<style>` scoped by the id that coloured and sized `.packetBlock`, `.packetLabel`, `.packetByte` and `.packetTitle` | No root `id`; `class="mermaid mermaid-packet"`, `role="img"`, `aria-roledescription="packet"`, `data-mermaid-version`. Paints are presentation attributes, colours reading `var(--_x)` aliases on the root `style`, which a host can re-theme with `--mermaid-packetLabelColor` and the other nine. What every piece shares is written once on the root and inherited: `font-family`, the labels' `fill`, the bit numbers' `font-size` and the blocks' `stroke-width`; each `rect` carries its `fill` and `stroke`, each bit number its `fill`, each label its `font-size`, the title its `fill` and `font-size`. No `<style>`, except under `theme: 'auto'`: core's light/dark sheet, scoped by `data-p` on the root, as for every type | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3); one copy of what every piece shares keeps large packets small |
| No source mapping | Each field's first `rect.packetBlock` carries `data-ast="field:<start>-<end>"`; every piece's rect carries `data-id="<start>-<end>"` of its field, so the pieces of a field split across rows share one `data-id`. The row `<g>`s carry nothing | One `data-ast` element per AST node (R-PARSE-8, D345, pitfall 12) |
| `text.packetTitle` always written, empty when the diagram has no title | Written only when there is a title | Nothing invisible is drawn |
| Labels and the title set with d3 `.text()` and `dominant-baseline="middle"`: `<br>` and tags printed as written, `&amp;` printed literally | Core's label layout ([Labels and text](#labels-and-text)): `<br>` breaks the line into `<tspan>`s, `<b>`/`<i>` render, entities decode; the text is placed by its baseline, centred where v12 centred it. A title of several lines keeps its first line where v12 drew its one line and grows down; a title taller than a row sits below the last row instead of over it. An empty label draws no `<text>` | D343 |
| A label wider than its field ran over its neighbours | It shrinks to fit (its own `font-size`), down to the bit-number size (10 px), then overflows as in v12; each piece of a split field fits its own label. A label of more `<br>` lines than fit the row's height shrinks the same way, and one that is still too tall at 10 px overflows above and below, centred on its block | D343 |
| Bit numbers with `dominant-baseline="auto"` | The same baseline, without the attribute (it is the default) | |
| `viewBox="0 0 <bitWidth × bitsPerRow + 2> <height>"`: a title or label running past it was clipped | The same unless something runs past it: the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover everything drawn, half the stroke included, and may start below 0 | D344 |
| A `paddingX` wider than a piece drew a negative `width` | `width="0"` | D342 |
| The 10,000-row cap dropped the fields past it silently and drew the rest | The same drawing, with one `PACKET_TRUNCATED` warning (D342). A diagram that reaches the cap draws about 430 characters a row, about 4.3 MB, past the default `maxOutputLength` (4,000,000), so at the default limits it fails with a `LIMIT` error; an integrator who raises `limits.maxOutputLength` gets it drawn | D342, R-SEC-5 |
| `neo` and the redux themes: the same packet as the classic themes | The same: packet differs between families by colour and font only, with no gradient and no shadow | D227 |

## Quadrant chart SVG structure

What changed in the quadrant chart's SVG compared with v12 (spec #289, #312). v12's groups and
classes are kept, in v12's order: `g.main` > `g.quadrants` (`g.quadrant`: `rect` + `text`),
`g.border` (six `line`s), `g.data-points` (`g.data-point`: `circle` + `text`), `g.labels`
(`g.label`: `text`) and `g.title`, each written even when empty. The last-declared point is
still drawn first, so the first is on top. Text keeps v12's `text-anchor`, `dominant-baseline`
and `transform="translate(x,y) rotate(r)"` placement.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, a `<style>` scoped by the id that gave every text its `fill` | No root `id`; `class="mermaid mermaid-quadrant"`, `role="img"`, `aria-roledescription="quadrantChart"` (kept), `data-mermaid-version`; every element carries its colour as a presentation attribute reading a `var(--_x)` alias on the root `style` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| A fixed `viewBox="0 0 chartWidth chartHeight"`: a point label near the edge ran off it and the browser clipped it | The same placement; the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover any label or point drawn past the chart. A chart where everything fits keeps `0 0 chartWidth chartHeight` | The bounding box covers what is drawn (D224) |
| Groups had no ids | `g.quadrant` has `data-id="quadrant-<n>"` and, when labelled, `data-ast="q:<n>"`; `g.data-point` has `data-id="<point name>"` and `data-ast="pt:<name>"` (`pt:<name>@2` for a repeated name); `g.label` has `data-id="x-axis-start"` (`-end`, `y-axis-…`) and `data-ast="ax:x"` / `ax:x/end` / `ax:y` / `ax:y/end`; `g.title` has `data-id="title"` and the `title` statement's `data-ast` | One element per AST node maps it to its source (R-PARSE-8) |
| An unlabelled quadrant drew an empty `<text>` | Only its `<rect>` | Nothing invisible is drawn |
| Border lines styled with `style="stroke: …; stroke-width: …"` | `stroke` and `stroke-width` attributes | No inline style (R-SEC-2) |
| Labels set as `textContent`: a quoted `<br>`, a raw line break inside quotes, `<b>`/`<i>` and a markdown string's `**` showed literally, entities as written | Core's label layout with no wrap width: every `<br>` form and a raw line break inside a quoted string break the line, `<b>` and `<i>` in a quoted label render bold and italic, other tags are dropped with their text kept (`"<script>x</script>"` draws `x`, where v12 showed the tags), markdown renders, entities decode, and math works (D176). A plain label is still one `<text>`; one with breaks or emphasis is a `<text>` with `<tspan>`s. Every v12 anchor and the square stay where v12 put them, and a label's extra lines grow away from the square: a title's earlier lines go above it, so its last line sits where v12's one line sat; a top x-axis label grows up (the title above it moves up with it); a left y-axis label grows left; bottom and right labels grow down and right. The bounding box grows over them, so `viewBox` can start below 0 | D225, D224 |
| Points: `fill="hsl(…, NaN%)"` and the same `stroke` (v12's `quadrantPointFill` rule had a precedence bug and a khroma call with no amount), so points showed the root `fill: textColor` and no stroke, even with a `stroke-width`; a user `quadrantPointFill` was ignored | `fill` from `quadrantPointFill`, which defaults to `textColor`: the same look in every theme, and a user value is honoured. A `stroke` is written only when an inline or class `stroke-color` sets one, so `stroke-width` alone still draws no ring; a drawn stroke counts toward the bounding box | D231, D224 |
| A style colour without `#` (`color: ff0000`) was written as `fill="ff0000"`, which browsers ignore | Written as `fill="#ff0000"` | D235 |
| Quadrant fills 2–4 derived from `primaryColor` (or `#ECECFE` in `redux`, `redux-color` and `neo`) | Derived from `quadrant1Fill`, which is `primaryColor` (`#ececfe` in those three): the same colours unless an author sets `quadrant1Fill` alone, which now moves 2–4 too. `default` keeps its fills and text fills under an author `primaryColor` or `primaryTextColor`, as v12's `theme-default.js` did (it derived them once, in its constructor, before the overrides), but its borders follow an author `primaryBorderColor`, which v12 ignored | D232, D656 |
| A point whose coordinate lexed but was not a number in [0, 1] (`0x5`, `0a5`) was drawn off the chart or at `NaN` | Left out, with one `QUADRANT_POINT_INVALID` warning per point | D226 |
| `look: neo` changed nothing in a quadrant chart | Every theme family draws it plain, without gradient, shadow or palette; families differ by colour only | D227 |
| Border lines in v12's khroma `primaryBorderColor` | Core's `primaryBorderColor`, the border colour of every other type, so some themes change (table below) | R-THEME-11 |
| `themeVariables.darkMode: true` switched `primaryTextColor` and `textColor` to `#eee` in `redux`, `redux-color`, `base` and `neo`, and so every quadrant text | Core's theme specs keep their text colours under `darkMode`, so quadrant text does too. This is core behaviour for every type, not a quadrant change | D571 |

Quadrant border colours (`quadrantExternalBorderStrokeFill` and `quadrantInternalBorderStrokeFill`)
where v12 and v13 differ; the other themes keep v12's colour.

| Theme | v12 | v13 |
| --- | --- | --- |
| `base` | `#eeddbb` | `#d9cfbc` |
| `redux`, `redux-color` | `#171717` | `#28253d` |

## gitGraph syntax and config

- **SVG only:** `gitGraph`, `gitGraph LR:`, `gitGraph TB:` and `gitGraph BT:` are detected by
  v12's case-sensitive `gitGraph` detector, after `timeline` and before `stateDiagram`.
  `format: 'ascii'` throws `UnsupportedFormatError` (D216).
- **Commit ids are derived, not random** (D260). A commit with no `id:` is still
  `<seq>-<7 hex digits>`, but the digits come from a fixed hash of the sequence number instead
  of `Math.random`, so the same text gives the same ids and the same SVG on every render. A
  derived id never takes an id that a `commit` or `merge` writes anywhere in the text.
- **Text is drawn as written** (D263). v12 stored `<`, `>` and `=` in ids, messages, tags and
  branch names as `&lt;`, `&gt;` and `&equals;` and broke branch names on `<br>`; v13 keeps the
  source text, escapes it in the SVG, and breaks a branch name only on a newline. Labels are
  plain text (D268): `$$…$$` and `fa:` stay as written, as in v12. Entity codes are decoded
  (D563): `#35;`, `#quot;` and `#9829;` in an id, a tag or a branch name draw `#`, `"` and `♥`,
  as in v12. A reference typed with `&` (`&amp;`) is decoded too; v12 showed it as written.
- **A repeated commit id** keeps v12's model (D264): the later commit replaces the earlier and
  lists itself as a parent. v13 warns `GIT_DUPLICATE_ID` on the second id, with the first as a
  related location, and draws no arrow for the self-parent. Where the repeat makes a parent
  cycle (`A`, `B`, `A`), only parents written earlier count for `parallelCommits`, and a commit
  with none is placed as a root; v12 threw in BT with `parallelCommits` and placed such commits
  differently from pass to pass elsewhere.
- **Branch names starting with `title`** are rejected, as in v12, with a hint to quote them
  (D269). A statement with a syntax error changes nothing; one that breaks a rule (an unknown
  branch, a merge of a branch into itself, …) keeps its place in the text but changes nothing
  either, and its error message is v13's own wording.
- **Titles are drawn** (D265): the in-text `title` and a front-matter `title` (the in-text one
  wins), 18 px in `textColor`, `gitGraph.titleTopMargin` above the drawing.
- **Overlapping branch labels are moved apart.** Where v12 drew branch labels over each other
  (TB and BT: a long name after a short one, since v12 spaces lanes by the previous name only;
  LR: names of four or more lines), the lane moves out until the boxes are 10 px apart.
  Elsewhere every position is v12's. In TB with a redux theme the branch name sits 1 px lower
  than v12's.
- **Arrows are drawn in commit order**; v12 used its commit map's insertion order, which differs
  only for repeated ids.
- **The default theme is `redux-color`** (D151): a v12 diagram without a `theme` drew in
  `default`. Add `theme: 'default'` for v12's look. `look` is ignored, with one `LOOK_REMOVED`
  warning (D153): the redux themes carry v12's `look: neo` gitGraph geometry and colours, the
  classic themes v12 classic, and `neo` / `neo-dark` classic geometry with the neo colours, as
  v12 drew them (D266). Each difference is a theme variable ([Theme geometry](#theme-geometry)).
- **Honoured** in the `gitGraph` section, with v12's defaults: `titleTopMargin` (25),
  `diagramPadding` (8), `mainBranchName` (`main`), `mainBranchOrder` (0), `showCommitLabel`,
  `showBranches`, `rotateCommitLabel` (true), `parallelCommits` (false) and `useMaxWidth` (true).
  A `titleTopMargin` or `diagramPadding` that is not a number of at least 0 draws with the
  default and a `GIT_CONFIG_IGNORED` warning. The language service reads `mainBranchName` and
  `mainBranchOrder` from the document's front matter and `init` directives; renaming the main
  branch is refused there, as its name is config, not text.
- **Ignored**, as v12's gitGraph never read them: `nodeLabel`, `arrowMarkerAbsolute` and
  `useWidth`.

## gitGraph SVG structure

What changed in the gitGraph's SVG compared with v12's `gitGraphRenderer.ts` and `styles.js`
(spec #292, DESIGN §7.2). v12's class names are kept where the element still exists:
`commit-bullets`, `commit-labels`, `commit-arrows`, `commit`, `commit<n>`,
`commit-highlight<n>`, `commit-<type>`, `commit-<type>-outer` / `-inner`, `branch`,
`branch<n>`, `branchLabelBkg`, `label<n>`, `branchLabel`, `label`, `branch-label<n>`,
`commit-label-bkg`, `commit-label`, `tag-label-bkg`, `tag-hole`, `tag-label`, `arrow`,
`arrow<n>`, `gitTitleText`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id, `aria-roledescription="gitGraph"` | No root `id`; `class="mermaid mermaid-gitGraph"`, `role="img"`, `aria-roledescription="gitGraph"` (kept), `data-mermaid-version`; colours, widths, dashes and sizes are presentation attributes, colours reading `var(--_x)` aliases on the root `style`. `accTitle` and `accDescr` give `<title id="<id>-title">` and `<desc id="<id>-desc">` | Inert output (R-SEC-2), only the title and description ids (R-A11Y-1) |
| The measuring pass left an empty `g.commit-bullets` and `g.commit-labels` at the top | One of each, after the branches and arrows, in v12's stacking order | Nothing invisible is drawn |
| Branches: one unclassed `<g>` holding each branch's `line`, `rect` and `g.branchLabel > g.label.branch-label<n> > text > tspan.row`, only with `showBranches` | `g.branches` holds one `g.branch-lane` per branch with `data-id="<branch name>"` and, for a `branch` statement, `data-ast="b:<name>"` (the implicit main branch has `data-id` only); inside, the `line`, the `rect` and `g.branchLabel > text.label.branch-label<n>`. Without `showBranches` the lane groups are written empty | One element per statement maps it to its source (R-PARSE-8) |
| The commit id in the class list: `commit <id> commit<n>`, so an id with a space or a dot made odd classes | The id leaves the class list. Each commit is a `g.commit-bullet.commit-<type>` group with `data-id="<id>"` and the `data-ast` of the statement that made it (`c:<id>`, `c#<k>`, `m:<branch>#<k>`, `cp:<source>#<k>`); its circles, squares, cross and cherry-pick marks keep v12's other classes | R-SVG-2, R-PARSE-8 |
| `path.arrow.arrow<n>`, one per parent; a commit that lists itself as parent (a repeated id) drew a zero-length path, and a parent listed twice (a cherry-pick onto the branch whose head is its source) two coincident paths | The same, with `data-id="<parent>><child>"` (`%` and `>` inside an id percent-encoded as `%25` and `%3E`, so `a>b` → `c` and `a` → `b>c` differ), `fill="none"`, round caps and the width as attributes; no path for a self-parent, one for a repeated parent | D264 |
| Commit labels and tags carried no id | The commit label's wrapper `<g>` (which keeps v12's rotation `transform`) and each tag's `polygon`, `circle` and `text` carry the commit's `data-id` | R-SVG-2; labels carry `data-id` only (pitfall 12) |
| Colour classes from `calcColorIndex` with v12's moduli: bullets and arrows over 8 slots, branch labels over 12 in the redux themes, slot 0 skipped only in `redux-color` and `redux-dark-color` | `<n>` is the branch's one slot for every part (D267): its index mod 8, or, with a non-empty `borderColorArray`, slot 0 for the first branch and 1–7 round the rest, as v12's bullets | D267 |
| Text set with d3 `.text()` after the DB's `&lt;`, `&gt;`, `&equals;`; branch names split on `\n` and `<br>` into `tspan.row` with `dy="1em"` | Each label is one `<text>` start-anchored where the layout measured it, in the font it measured; a branch name's lines are `<tspan x y>`. Ids, tags and names are drawn as written and escaped by the writer, a branch name breaks only on a newline, and `$$…$$` or `fa:` stays as written. Entity codes (`#35;`, `&amp;`) are decoded before the text is measured and drawn | D263, D268, D563 |
| Colours from a `<style>` chosen by theme name (`REDUX_GEOMETRY_THEMES`, `COLOR_THEMES`, `NEO_THEMES`, `DARK_THEMES`, `NEO_COLOR_GEN_THEMES`) | The same colours from theme variables, read in every theme: the `git`, `gitInv` and `gitBranchLabel` palettes, `borderColorArray` when non-empty, the node colours (`nodeBorder`, `mainBkg`) where v12's neo and redux themes used them, the label variables, `primaryColor`, `textColor` and `commitLineColor`. The redux and neo differences are the flags `gitNodeColors` and `gitPaletteColors` and the bullet sizes `gitHighlightInnerSize`, `gitMergeRadius`, `gitReverseCrossSize` and `gitCherryPickDotRadius`, next to the layout's geometry variables ([Theme geometry](#theme-geometry)). A classic cherry-pick body is still unpainted (black), as in v12 | D152, D153 |
| `look: neo` gave branch label boxes `style="filter: …"` (a `<filter id="<id>-drop-shadow">` in the redux themes) and `data-look="neo"`; `useGradient` wrote `<linearGradient id="<id>-gradient">` whatever the look | The box takes the theme's `dropShadow` as a `filter` attribute wherever it is not `none`, whatever the look, and no `data-look`; the neo outline is core's gradient (`<prefix>-gradient`, written only when referred to). Tags take the shadow in the neo and redux themes, as v12's `.tag-label-bkg` did | D153, D182 |
| Branch names and ids at `noteFontWeight` in the redux themes (CSS) | `font-weight` from the theme's `fontWeight`, which the layout measures with: the same weight in every v12 theme. An author's `noteFontWeight` is not read; set `fontWeight` | Measure in the font drawn (pitfall 16) |
| The cherry-pick mark white, black in `dark`, `redux-dark`, `redux-dark-color` and `neo-dark` | The colour variable `gitCherryPickInk`: `#000000` set by those four themes, white where a theme sets none (so `darkMode: true` on a light theme stays white, as in v12); under `theme: 'auto'` it switches with the colour scheme | D152 |
| `utils.insertTitle`: `text.gitTitleText` centred by the svg's `getBBox`, 18px and `textColor` from CSS | `text.gitTitleText` where the layout centred it over the drawing, with `fill` and `font-size="18"` attributes. The in-text `title` and a front-matter `title` are both drawn | D265 |

## Gantt chart

The gantt parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; the schedule is compared with v12's DB at a fixed instant). The differences:

### Time and now

- **Host local time (D270):** dates, `today` and the time axis use the host time zone, with
  daylight saving handled as d3-time does, as in v12. There is no dayjs or d3 any more: the date
  code is a port of Pele's (D271), with v12's dayjs quirks kept.
- **`now` is a render option (D270, D275):** the instant the chart treats as today is
  `render(id, text, { now })` (a number or a `Date`); `mermaid` defaults it to `Date.now()` at
  each call, in the browser, Node and the CLI. Diagram text cannot set it. The today line is
  drawn only when `now` lies in the chart's time domain.
- **Schedule errors (D274):** an invalid date, a first task with no start, more than three
  fields in a task, or excludes that leave no day reject the render as `SEMANTIC` at the task's
  position (`GANTT_INVALID_DATE`, `GANTT_NO_START`, `GANTT_TOO_MANY_FIELDS`,
  `GANTT_EXCLUDED_ALL`), with v12's messages. v12 threw from its renderer. Parsing no longer
  depends on `now`, so a cached parse stays valid.
- **Scheduling work limit (D542, R-SEC-5):** a chart whose schedule walks more than
  `maxLayoutWork` days (default 1,500,000; every day a task spans is walked for its excluded
  days, on each pass) is refused with a `LIMIT` error. v12 rendered it, after minutes: about
  2,000 tasks of `9000y` with any `excludes` fit in the source limit. The largest corpus chart
  walks 689 days. Raise it with `initialize({ limits: { maxLayoutWork } })` or a per-call
  `config.limits`.
- **Warnings (D276, D727):** unknown `after`/`until`/`click` ids (`GANTT_UNKNOWN_TASK`; a click
  names only a task written before it, as v12 bound it while reading the line) and data that
  is neither a date nor a duration (`GANTT_BAD_DURATION`), one each per render, where v12 only
  logged. The unknown-id text has one clause for each statement involved and says only what
  that statement did (`after` starts and `until` ends at midnight today, a click does nothing);
  `__proto__` is reported as a reserved id; the milestone hint appears for a milestone's own `after`/`until`, and when an unknown id is the one a milestone wrote where its duration goes. Also new: `GANTT_TICK_INTERVAL_IGNORED` (a `tickInterval` that would draw more than
  10,000 ticks: automatic ticks instead), `GANTT_EXCLUDES_NOT_DRAWN` (a chart over five years
  draws no excluded days, as v12) and `GANTT_CONFIG_IGNORED`.
- **Nothing at NaN (D277, R-LAYOUT-3):** a chart with nothing to schedule draws its title and
  an empty plot with no ticks; a task in a cycle of `after`/`until` keeps its row but draws no
  bar; an `x`/`X` timestamp past the `Date` range is an invalid date; a bar whose `until` is
  before its start is 0 wide. v12 drew NaN coordinates in each case.

### Syntax

- **`topAxis` works (D273):** v12's grammar called a DB function that does not exist, so any
  text with the `topAxis` statement failed. v13 accepts it and draws the top axis, as
  `gantt.topAxis` does. A listed parity divergence; nothing that rendered in v12 changes.

### Text

- **Entity codes are decoded (D563):** `#35;`, `#quot;`, `#lt;` and `#9829;` in the title, a
  section name or a task label draw `#`, `"`, `<` and `♥`, as in v12. Markup and `\n` are still
  shown as written, as v12 drew them with `.text()`. A reference typed with `&` (`&amp;`) is
  decoded too; v12 showed it as written. A `#name;` Mermaid does not know stays as written
  (D561).
- **A label wider than its bar goes outside it (D729, provisional):** with `excludes`, a task's
  bar is drawn shorter than its span. v12 chose the label's side from the whole span and placed
  it from the drawn bar, so a label wider than the drawn bar but not than the span was centred on
  the bar's end, across the bar. v13 chooses the side from the drawn bar: such a label goes right
  of the bar, or left near the chart's edge. Labels that fit are unchanged.

### Config

- **Honoured:** `titleTopMargin`, `barHeight`, `barGap`, `topPadding`, `rightPadding`,
  `leftPadding`, `gridLineStartPadding`, `fontSize`, `sectionFontSize`, `numberSectionStyles`,
  `axisFormat`, `tickInterval`, `topAxis`, `displayMode`, `useWidth`, `useMaxWidth` and
  `weekday`. Unset, each takes v12 12.2.0's merged default. `look` is ignored (D153).
- **Width (D272):** the chart is laid out `gantt.useWidth` px wide, else to the
  `availableWidth` render option, else 1200 px. v12 laid out to its container's
  `offsetWidth`; v13 has no DOM in core, so it fills the container only with
  `mount(…, { availableWidth: true })`. Otherwise `useMaxWidth` (on by default) scales the
  1200 px chart down to the container, so a narrow page shows smaller text than v12 did.
- **`gantt.weekday` (D279):** the day a `week` tick interval starts on, the `weekday`
  statement winning. v12 never read the config key.
- **Checked values:** a length that is not a number of at least 0, a `numberSectionStyles`
  below 1 or a font size that is no CSS size keeps the default, with one `GANTT_CONFIG_IGNORED`
  warning per key. `fontSize` and `sectionFontSize` take a number (px) or a CSS size such as
  `14px`, as v12 wrote them into `font-size`.
- **Text output:** `format: 'ascii'` is not available for gantt charts; it throws
  `UnsupportedFormatError` (D216).

### Themes

- The gantt variables keep v12's names (`sectionBkgColor`, `altSectionBkgColor`,
  `sectionBkgColor2`, `excludeBkgColor`, `gridColor`, `todayLineColor`, `vertLineColor`,
  `taskBkgColor`, `taskBorderColor`, `activeTaskBkgColor`, `activeTaskBorderColor`,
  `doneTaskBkgColor`, `doneTaskBorderColor`, `critBkgColor`, `critBorderColor`,
  `taskTextColor`, `taskTextOutsideColor`, `taskTextDarkColor`), and `themeVariables`
  override each one in every theme ([theme-variables.md](./theme-variables.md)).
- **Derived in every theme (D331):** each is derived from the shared variables as v12's
  `theme-base.js` derives it (`vertLineColor` from `primaryBorderColor`, as v12's redux and neo
  themes do; dark themes fill done tasks with `mainBkg` lightened, v12's `secondBkg`). v12's
  classic themes set their own gantt colours, and `redux-color` and `redux-dark-color` took
  the bands from `cScale0`/`cScale1`; those are not carried, so gantt colours differ from v12
  most in `default`, `dark`, `forest` and `neutral` (bars are the theme's `primaryColor`, text
  `textColor`). Set the variables in `themeVariables` for v12's look.
- **Under a `themeVariables` override (D656, D657):** in the classic family the task bars,
  the active bar and the section bands (`taskBkgColor`, `activeTaskBkgColor`, and through
  `sectionBkgColor`, `sectionBkgColor2`) read `mainBkg`, and the active bar's outline and the `vert` marker read
  `guideLineColor`. `default`, `dark`, `forest` and `neutral` pin both to their own primary and
  line colours, so an author's `primaryColor` or `lineColor` leaves the bars and the outline
  alone there, as in v12. In `base` they derive from `primaryColor` and `lineColor`, so they
  follow them, as in v12, except that the active outline and the `vert` marker follow
  `lineColor` where v12's followed `primaryColor` and stayed navy (D574). Set
  `guideLineColor` in `themeVariables` to move the outline and the marker.
- **The first section band is visible in every classic theme (D726, #1249):** `sectionBkgColor`
  is the theme's `mainBkg` darkened (to black under `dark`). Bands are drawn at opacity 0.2,
  as in v12, and the band as drawn reads at least 1.1:1 against the page, the grid lines and
  the done bars at least 1.2:1 against it, and the text written on it at AA. v12's `default` drew a lavender `rgba(102, 102, 255, 0.49)`; v13's is
  `#9898d1` (v13 used the near-white `#f9ffec` before). `neutral` is `#aeaeae` (v12 `#bdbdbd`),
  `forest` `#98b25c` (v12 `#6eaa49`), `base` `#d1bb8b` (v12 `#f6f9ff`) and `dark` `#000000`
  (v12 `#b4ac76`). An author's `sectionBkgColor` wins in
  every theme; an author's `mainBkg` also moves the band, and `base`'s band no longer follows
  `tertiaryColor`. The v13-only `bandBkg` variable is removed (it never existed in v12): a
  `themeVariables.bandBkg` is ignored without a warning, like any unknown name; set
  `sectionBkgColor`.
- **Zebra section bands (D730):** the third band (`sectionBkgColor2`) repeats the first, so the
  tinted rows alternate with `altSectionBkgColor` like zebra rows, in every classic theme. v12
  gave the third band its own colour (`default` `#fff400`, `neutral` and `forest` the first
  band's, `dark` `#eae8d9`, `base` `#fff4dd`); in v13 it was `mainBkg`, which at opacity 0.2 was
  barely apart from the page. An author's `sectionBkgColor` moves both tinted bands; set
  `sectionBkgColor2` as well to colour the third band on its own.
- **A `mainBkg` override moves the bars (D657):** an author's `mainBkg` recolours the task
  bars, the active bar and the third band in every classic theme, where v12's `default`,
  `forest` and `neutral` kept their own; under `dark` the text on the active bar follows that
  fill. To darken the bars in the named themes, set `mainBkg`: a dark `primaryColor` with
  light `textColor` leaves their pale bars alone, so the light text sits on pale bars (v12
  kept its bars there too, with fixed white text).
- **Three responses stay v13's (D667):** under `neutral` the done bar's outline stays grey
  where v12's followed `lineColor`; under `dark` the alternate band stays white where v12's
  followed `background`, and done bars follow `mainBkg` where v12's stayed light grey. Set
  `doneTaskBorderColor`, `altSectionBkgColor` or `doneTaskBkgColor` for v12's colours.
- **Contrast in the classic themes (D574):** with bars in the pale `primaryColor`, the classic
  family (`default`, `dark`, `forest`, `neutral`, `base`) draws the `vert` marker and its label
  and the active bar's outline in `lineColor`. Text on a critical bar has its own variable,
  `critTextColor` (new in v13; `taskTextColor` in every theme), which the classic family turns
  black where `taskTextColor` misses WCAG AA on red; text on the other bars stays
  `taskTextColor`. Under `dark`, the critical fill is `#990000`, so the light text reads on it,
  and text on active and done bars is white where `textColor` misses AA (R-THEME-9).
- **`taskTextClickableColor` is gone:** a clickable label is v12's `#003163` in every theme, a
  constant. The variable is ignored (R-CONF-5).
- **No gradient or shadow (D278):** `neo` and `neo-dark` take neo colours only, as v12.

## Gantt SVG structure

What changed in the gantt's SVG compared with v12's `ganttRenderer.js` and `styles.js`, and why
(DESIGN §7.2, spec #293). v12's classes stay on the elements they were on: `section sectionN`,
`task`, `milestone`, `vert`, `task|active|done|crit|activeCrit|doneCrit` + N, `clickable`,
`taskText`, `taskTextOutsideLeft|Right`, the `taskTextN`, `taskTextOutsideN`, `activeTextN`,
`doneTextN`, `critTextN`, `activeCritTextN`, `doneCritTextN`, `milestoneText` and `vertText`
classes, `sectionTitle sectionTitleN`, `grid`, `tick`, `today`, `exclude-range` and `titleText`.
Class lists are written with single spaces and no trailing blank.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id that gave every element its colour; `viewBox="0 0 w h"` fixed | No root `id`; `class="mermaid mermaid-gantt"`, `role="img"`, `aria-roledescription="gantt"`, `data-mermaid-version`; colours are presentation attributes reading `var(--_x)` aliases of v12's gantt theme variables. The `viewBox` is `0 0 w h` grown to cover what is drawn (an outside label, a wide title) | Inert output (R-SEC-2), R-A11Y-1, D224 |
| Element ids `<id>-<task id>` on bars, `<id>-<task id>-text` on labels, `<id>-exclude-<date>` on excluded days | No ids. A bar carries `data-id="<task id>"` and `data-ast="t:<id>"`, its label `data-id` only; a section title `data-id="<section>"` and `data-ast="s:<section>"`. A section statement v12 drew no title for (a repeated name, a section of only `vert` markers) gets an empty `<g class="sectionTitle" data-id data-ast>` | R-PARSE-8, no colliding ids |
| `width-<n>` classes on labels | Dropped | They held the measured width, which depends on the measurer |
| A linked task wrapped in `<a xlink:href target="_top">` only under `securityLevel: sandbox`; otherwise `href` was a `window.open(url, '_self')` handler on the bar and label. v12's sanitizer rewrote the URL (`https://example.com` → `…com/`) | The bar and label of a task a `click … href` names sit in one `<a href>`, after the other tasks, in every security level, with no `target`. The URL is kept as written and checked by core: an unsafe one draws the task unlinked with one `URL_REFUSED` warning | R-SVG-4, R-SEC-4, D23, D62 |
| `todayMarker` written as a `style` attribute with `,` turned into `;` | Split on `,` (the statement stops at `;`, so none reaches the value) and checked: allowed properties become presentation attributes on the line, others are dropped with `STYLE_PROPERTY_DROPPED` | R-SEC-2 |
| A `transform-origin` attribute on every bar and every excluded-day rect; milestones turned by CSS, `transform: rotate(45deg) scale(0.8, 0.8)` about it | No `transform-origin`. A milestone carries the same geometry as a `transform` attribute about v12's origin (its square's centre; above the marker for a task tagged both `vert` and `milestone`, which keeps both, as in v12) | No CSS in the output |
| `<g class="grid" transform="translate(leftPadding, h − 50)">` (top axis: `translate(leftPadding, topPadding)`) and d3's `<g class="tick" transform="translate(x, 0)">` per tick | The same elements at absolute coordinates, without `transform` | The renderer writes absolute coordinates |
| Tick text `fill="#000"` `stroke="none"` `font-size="10"`, overridden by `.grid .tick text { fill: textColor }`; d3's tick lines `stroke="currentColor"` (the page's colour, as v12's `.grid .tick { stroke: gridColor }` matched only the group); d3's axis path, hidden by `.grid path { stroke-width: 0 }`; `shape-rendering: crispEdges` on ticks and `doneCrit` bars | Tick text in `textColor` at 10px; tick lines in `gridColor` at v12's 0.8 opacity; no axis path; no `shape-rendering` | What v12's CSS meant (D666: set `gridColor` for v12's dark lines); `shape-rendering` is not an allowed attribute |
| `cursor: pointer` on clickable bars and labels; `text-height` on labels | Dropped; the `clickable` class stays for host CSS | No CSS in the output |
| A `<text class="titleText">` always, empty without a title | Only when there is a title | Nothing invisible is drawn |
| An HCL colour scale (`#00B9FA` → `#F95002`) built and never used | Dropped | It never reached the output |
| Section titles `<text dy="−(n−1)/2 em">` with `alignment-baseline: central` `<tspan dy="1em">`s | One `<text>` with a `<tspan>` per `<br>` line at an absolute `y`, 1em apart, each line centred on its own row as v12 drew it | `alignment-baseline` is not an allowed attribute |
| Slots past `section3` (`numberSectionStyles` over 4) had no rule, so their bands, bars and inside labels took the root's `fill: textColor`, bars no stroke, and outside labels `taskTextDarkColor` (`.taskTextOutsideLeft`/`Right`) | Kept | P2 |
| `look: neo` changed only colour variables | Every theme draws gantt without gradient outline or shadow | D278 |

## Kanban

- **Detection:** `kanban` is detected by v12's case-sensitive detector with no word boundary,
  between `c4` and `classDiagram` as in v12. So `kanbanBoard` or `kanbanx` is detected as a
  kanban board and then rejected as a syntax error (`SYNTAX`), and `Kanban` or `KANBAN` is not
  detected at all (`UNSUPPORTED_DIAGRAM`), as in v12. The language service, CodeMirror and
  Monaco know it.
- **Text output** (`format: 'ascii'`, new; v12 had none) draws the columns side by side as boxes,
  `sectionWidth` in cells wide (200 px is 25 columns), with each column's title on its top
  border and its cards stacked inside, labels wrapped to the card. A card's last row has the
  ticket on the left (plain text, never a link) and the assignee on the right, or each on a row
  of its own when they do not fit side by side. The priority is the card's left edge: heavy
  for `Very High` and `High`, dashed for `Low` and `Very Low`; in the `ascii` charset a tag on
  the card's top border (`[!!]`, `[!]`, `[-]`, `[--]`) tells the four apart. `:::` classes, bold and
  italic text, ticket links and `accTitle`/`accDescr` are dropped with one `ASCII_DROPPED`
  warning each (`style`, `emphasis`, `link`, `accessibility`); a board wider than `ascii.maxWidth` is not folded and adds
  `ASCII_TOO_WIDE` ([ASCII output](./ascii.md#kanban-boards)).
- **Syntax** is v12's: a differential test runs v12 and v13 over every e2e fixture and the v12
  spec and docs examples, and the grammar is in [syntax/kanban.md](./syntax/kanban.md). Every
  error is reported, not only the first, with messages in words (R-PARSE-4). As in v12, an item
  indented less than the first column is an error once another item follows it (the message
  starts with v12's `Items without section detected`), and so is an item whose text starts with
  the word `kanban` in any case. Errors v12 raised as a `TypeError` or not at all are now
  diagnostics with a range: an `::icon()` or `:::` line before any item, shape data that is
  empty or `null` (`@{ }`), and a `shape` that is not a lower-case string (`shape: 5`).
- **`accTitle` and `accDescr`** (D742): `accTitle: …`, `accDescr: …` and `accDescr { … }`, on a
  line of their own at any indent, before or between columns, set the SVG's `<title>` and
  `<desc>` (with `aria-labelledby` and `aria-describedby`), as in the other types, and draw
  nothing. v12's kanban had no such statements: it drew each line as a column or card, and
  rejected the `{` of the block form. A later statement replaces an earlier one. `accTitle[x]`,
  or `accTitle` without a `:`, is still an item. The text output drops them with an
  `ASCII_DROPPED` warning (`accessibility`).
- **Columns that share an id** (D373): v12 listed the cards of every column with that id under
  each of them, so two `docs` columns both drew both columns' cards. A card now belongs to the
  column it follows. Repeated ids are allowed for columns and cards alike.
- **Labels** (D372) are SVG text from core's label layout, measured in the theme's font, instead
  of HTML in `<foreignObject>`: `<br>`, the drawn tags, entities, math and `fa:` icons work in
  column titles, card titles, tickets and assignees. Column titles wrap at `sectionWidth` and card
  labels 25 px inside it, as in v12; a single word wider than that stays whole and overflows the
  column or card, as in v12 (earlier v13 builds split it between characters; the text output
  still does, to keep it in its box). A raw line break inside a quoted label breaks the line,
  as in v12, whose markdown labels turned it into a `<br>` (D641).
- **Markdown only in markdown strings** (D710, D712). v12 read every label as Markdown, so
  `**bold**` and `*italic*` drew bold and italic without backticks. Now only a label wholly in
  backticks (`` ["`**bold** card`"] ``, `` assigned: '`**md**`' ``) is read as Markdown; in any
  other label `**bold**` is drawn as written. Wrap the label in `` "`…`" `` to keep the old
  look. Inline code and list syntax (``Use `npm ci` first``, `- not a list`, `1. step`) are
  drawn as written, as v12 drew them; earlier v13 builds drew them as code and list items.
- **Metadata v12 parsed but never drew is still not drawn** (D376), with no warning: an item's
  icon (`::icon()` or `@{ icon }`), and a column's `ticket`, `assigned` and `priority`. It stays
  in the model and the AST.
- **Priority** (D375): `Very High`, `High`, `Low` and `Very Low`, matched exactly, draw v12's
  bar in `red`, `orange`, `blue` and `lightblue` in every theme. Anything else draws no bar
  (v12 drew one with no stroke), and one `KANBAN_PRIORITY` warning per render names the card
  values that are none of those four nor `Medium`.
- **Ticket and assignee** (D647): a card's ticket and assignee that do not fit side by side
  are drawn on two rows, the assignee under the ticket and still right-aligned, and the card
  grows to hold them, as the text output does. v12 drew them on one row whatever their widths,
  so long ones were drawn over each other. A pair that fits keeps v12's row and card height
  ([Kanban SVG structure](#kanban-svg-structure)).
- **Ticket links** (D377) pass the link check, and a refused URL draws the ticket as plain text
  with a `URL_REFUSED` warning; the first `#TICKET#` is replaced with the ticket taken literally
  ([Kanban SVG structure](#kanban-svg-structure)). The ticket and assignee follow the label
  rule, so a tag the ticket draws as formatting is left out of its link: `<b>T-1</b>` draws a
  bold `T-1` and links to `…T-1`, where v12 put the tags in the URL (D712).
- **Column colours** (D374, D741) come from the `cScale` palette in every theme, lightened by
  10, or darkened under `themeVariables.darkMode` and in `neo-dark`, `redux-dark` and
  `redux-dark-color`. They cycle through the twelve slots, so v12's black columns past the tenth
  are gone, and those three dark themes darken where v12 left them light
  ([Kanban SVG structure](#kanban-svg-structure)).
- **`theme: dark` with `themeVariables.darkMode: true`** (D741): the columns lighten, as under
  `theme: dark` alone, where v12 darkened them. The dark theme's columns follow v12's `dark`,
  which never set `darkMode`; an author's `darkMode` darkens only a light theme.
- **Config** (D378). The `kanban` section is honoured with v12's defaults: `sectionWidth` (200),
  `padding` (8), `ticketBaseUrl` (empty, so no links) and `useMaxWidth` (true); `kanban.theme`
  wins over the top-level `theme` for kanban boards. v12's kanban read three `mindmap` keys:
  `mindmap.padding` (10) as its margin, `mindmap.useMaxWidth`, and `mindmap.maxNodeWidth` (in
  its DB), and it never read `kanban.padding` or `kanban.useMaxWidth`. v13 reads the `kanban`
  keys and none of the three `mindmap` keys, so the default margin round a board is 2 px
  tighter on each side, and a `mindmap` setting no longer changes a board. `sectionWidth: 0` is 200, as v12's `sectionWidth || 200`. Numeric
  strings (`"300"`, not `"300px"`) are read as numbers, as in v12. A `sectionWidth` above 0 and
  below 26 is raised to 26, where v12 drew cards of negative width, and a value that is not a
  number from 0 to 10,000 lays out with the default; each warns `KANBAN_CONFIG_IGNORED`.
  `useWidth` is ignored (v12 never read it), and `look` is ignored as everywhere (D153), except
  that `look: handDrawn` sketches the board when `@mermaid-js/plugin-hand-drawn` is installed.
- **Hand-drawn** (D379): columns and cards are sketched. v12 sketched columns only (cards never
  got the look), and its card code would have dropped the priority bar; v13 keeps the bar
  ([Hand-drawn look](#hand-drawn-look)).
- **Limits** (R-SEC-5): a board may have up to `limits.maxNodes` items, columns and cards
  together (10,000); over it, render rejects with a `LIMIT` `MermaidError`. v12 had no such
  limit. Only the integrator can raise it ([Limits](#limits)).

## Kanban SVG structure

What changed in the kanban's SVG compared with v12 (spec #424, D372–D379). v12's groups and
classes are kept so selectors that use them keep working: `g.sections` holds one
`g.cluster.section-<k>` per column (k from 1), then `g.items` one `g.node` per card, in board
order. Every column and card carries `data-id` and `data-ast`, its item's AST id (`n:<id>`,
`n:<id>@2` for a repeated id, an id-less item's text as its id).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id, a `viewBox` with `mindmap.padding` (10) around the board, `mindmap.useMaxWidth` | No root `id`; `class="mermaid mermaid-kanban"`, `role="img"`, `aria-roledescription="kanban"`, `data-mermaid-version`; the `viewBox` is what is drawn plus `kanban.padding` (8) on each side, so 2 px tighter by default, and may start at a negative `x` or `y`; `width="100%"` and `max-width`, or `width` and `height` with `kanban.useMaxWidth: false` | Inert output (R-SEC-2), D224, D378 |
| Each column and card had `id="<render id>-<item id>"`, which a repeated id duplicated | No element id at all: kanban has no title or description statement, so not even `<render id>-title`/`-desc` | No colliding ids (R-A11Y-1) |
| Column: `<g class="cluster <classes> section-<k>" id data-look>` with a `<rect>` (a rough `<path>` under `look: handDrawn`) and a `g.cluster-label` around a `<foreignObject>`; an unclassed column wrote the class `undefined` | `<g class="cluster section-<k>[ <classes>]" data-id data-ast>` with the `<rect>` and `<g class="cluster-label">` holding a `<text>` centred on the column; no `undefined` class, no `data-look` | One element per item maps it to its source (R-PARSE-8) |
| Card: `<g class="node undefined" id>` (or `node <classes>`) with `<rect class="basic label-container __APA__">`, an unclassed priority `<line>` and three labels in `<foreignObject>`s, the ticket's inside `<a class="kanban-ticket-link">` | `<g class="node[ <classes>]" data-id data-ast>` with `<rect class="basic label-container">`, `<line class="kanban-priority">` when there is a bar, then `<g class="label">` for the title, the ticket (inside the link, when there is one) and the assignee, each holding a `<text>`: the title and ticket left-aligned 10 px in from the card's left edge, the assignee right-aligned (`text-anchor="end"`) 10 px in from its right edge; no `undefined`, no `__APA__` | Same |
| Labels: markdown HTML in `<foreignObject>`, wrapped by the browser; a raw line break in a quoted label became a `<br>` and broke the line | `<text>`/`<tspan>` from core's label layout, for all four kinds: `<br>`, the drawn tags, entities, math and `fa:` icons work, and Markdown only in a label wholly in backticks (D712); titles wrap at the column width `W` (columns) and `W − 25` (cards, tickets and assignees); a raw line break in a quoted label breaks the line, as in v12 | R-TEXT-1, D372, D641, D712 |
| Ticket link: `xlink:href` set to `ticketBaseUrl.replace('#TICKET#', ticket)` (so `$&` in a ticket expanded to the match), `target="_blank"`, no check (only DOMPurify removed a `javascript:` URL); underlined by `.kanban-ticket-link` in the `<style>` | `<a class="kanban-ticket-link" href target="_blank" rel="noopener noreferrer" text-decoration="underline">`. The first `#TICKET#` is replaced with the ticket taken literally (`$&` stays `$&`), not percent-encoded, and the URL passes the link check (`securityLevel`, `linkSchemes`). A refused URL draws the ticket as plain text with one `URL_REFUSED` warning. No link without a ticket or a `ticketBaseUrl` | R-SEC-4, R-SEC-6, R-SVG-4, D377 |
| Priority: a 4 px line in `red`, `orange`, `blue` or `lightblue` for `Very High`, `High`, `Low`, `Very Low` (exact case); `Medium`, any other value and a non-string drew the line with no stroke (invisible) | The same four colours, in every theme; anything else draws no line. One `KANBAN_PRIORITY` warning per render names each card value that is none of the four nor `Medium` (a non-string is never one of them), with the cards' AST ids. A column's priority is not drawn or checked | D375, D376 |
| A card's ticket (left) and assignee (right) on one row under the title, whatever their widths: long ones were drawn over each other and ran past the card's bottom | The same row when they fit side by side. When their widths fill the row (the card's width less 10 px at each side), the assignee goes on a row of its own under the ticket, still right-aligned, and the card grows by both rows, the title 10 px below its top and the assignee 10 px above its bottom, as the text output does | D647 |
| Colours from the `<style>`: `.section-<k> rect { fill, stroke: lighten(cScale<k+1>, 10) }` (`darken` under `darkMode`), no rule past column 10, so those columns drew black; `.node rect { fill: background; stroke: nodeBorder; stroke-width: 1px }`; HTML labels in `textColor` | Presentation attributes reading `var(--_x)` aliases on the root `style`. Column k fills and strokes `kanbanColumn<(k + 1) mod 12>`, kanban's own theme variable: `cScale<n>` lightened by 10, darkened under a dark theme or `darkMode` (the `dark` trait, so `neo-dark`, which v12 left light, darkens). Columns cycle through the twelve slots and are never black; `cScale<n>` overrides recolour them, and `--mermaid-kanbanColumn<n>` sets one directly. Card rects take `background` and `nodeBorder`, 1 px, `rx`/`ry` 5; column titles and every card label `textColor` | D152, D331, D374 |
| `look: neo` put the global `[data-look="neo"].cluster rect` gradient stroke and shadow on column rects | `look` is ignored; kanban differs between the four families by colour only, with no gradient and no shadow | D153, D227 |
| `look: handDrawn` sketched columns only (cards never got the look), and the card code that would have sketched them dropped the priority bar | With `@mermaid-js/plugin-hand-drawn`, columns (`group`) and cards (`node`) are sketched through `w.outline`; the priority bar, the link and the text are not, and the bar is kept | D379 |
| The mindmap rules v12's kanban style sheet carried (`.edge`, `.section-edge-*`, `.edge-depth-*`, `.node-icon-*`, `.section-root`, `.disabled`, `.kanban-label`, `.icon-container`, `.section-<k> line`, `.section-<k> text`) | Not ported: they matched nothing in a kanban board | — |

## Radar chart

The radar parser accepts the v12 language (oracle parity over every e2e fixture and the v12 spec
strings; grammar in [syntax/radar.md](./syntax/radar.md)). What changes in the drawing
(spec #422):

| v12 | v13 | Why |
| --- | --- | --- |
| `radar.axisColor` was each classic theme's `lineColor`, but an author's `lineColor` override moved the axes only in `forest`, `neutral` and `base`: `default` kept `#333333`, and `dark`'s `updateColors()` resets `lineColor` to `mainContrastColor` (`lightgrey`) before it builds the `radar` block, so the axes stayed `lightgrey` | `radarAxisColor` is the rule `lineColor` in every theme, so the axes follow an author's `lineColor` (an explicit `radarAxisColor` or `themeVariables.radar.axisColor` still wins) | D351 |
| `redux`: no `radar` block, so the axes took theme-default's `#333333` | The axes take the theme's `lineColor`, `#000000` | D333(b) |
| `redux-color`: no `radar` block, so the axes took theme-default's `#333333` | The axes take the theme's `lineColor`, `#000000` | D333(b) |
| `redux-dark`: no `radar` block, so the axes took theme-default's `#333333`, barely visible on the `#333333` background | The axes take the theme's `lineColor`, `#cccccc` | D333(b) |
| `redux-dark-color`: no `radar` block, so the axes took theme-default's `#333333`, barely visible on the `#333333` background | The axes take the theme's `lineColor`, `#cccccc` | D333(b) |
| `neo`: no `radar` block, so the axes took theme-default's `#333333` | The axes take the theme's `lineColor`, `#000000` | D333(b) |
| `neo-dark`: no `radar` block, so the axes took theme-default's `#333333`, barely visible on the `#333333` background | The axes take the theme's `lineColor`, `#cccccc` | D333(b) |
| `themeVariables.radar.*` (nested only) | Each key is also the flat variable `radar<Key>` (`radarAxisColor`, … `radarLegendFontSize`); the nested key still works, and the flat name wins when both are set | D335, D540 |
| A `radar` config value of the wrong type or outside its range (`width: "wide"`, `curveTension: 3`) was used as it was (a value that is not a number drew `NaN`) | A number, or a numeric string as its number, inside the key's schema range; anything else draws with the default and one `RADAR_CONFIG_INVALID` warning per key | D356 |
| `.radarTitle` and `.radarAxisLabel` set CSS `color` (`titleColor`, `axisColor`), which paints no SVG text, so all text filled with the root `textColor` | All radar text is drawn in `textColor`, as v12 drew it; radar does not read `titleColor` | D352 |
| Curves past the twelfth (`radarCurve-12`, …) had no rule and filled opaque black with no stroke | Curve *i* takes slot *i* mod 12 (`radarCurve-0` again for the thirteenth), as pie's slices | D353 |
| `max` equal to `min` wrote `NaN` paths; a curve whose entry count is not the axis count was skipped silently; `ticks` over 32 was only logged | Curves drawn at the centre with one `RADAR_EMPTY_RANGE` warning; the curve is still left out, with one `RADAR_CURVE_SKIPPED` warning naming every such curve; `RADAR_TICKS_CLAMPED`. A detailed entry naming no axis is still ignored, with `RADAR_UNKNOWN_AXIS` | D356 |
| `radar.legendBoxSize` (12) was declared and never read: the swatch was always 12 px | `radarLegendBoxSize` sizes the swatch, and the legend text stays 4 px right of it; with the default, nothing changes | D359 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |

## Radar SVG structure

What changed in the radar chart's SVG compared with v12 (spec #422, DESIGN §7.2). The v12 class
names are kept (`radarGraticule`, `radarAxisLine`, `radarAxisLabel`, `radarCurve-<i>`,
`radarLegendBox-<i>`, `radarLegendText`, `radarTitle`) and so is v12's draw order: rings, axes,
curves, legend, title.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="radar"`, `overflow="visible"`, a `<style>` scoped by the id | No root `id` and no `overflow`; `class="mermaid mermaid-radar"`, `role="img"`, `aria-roledescription="radar"`, `data-mermaid-version`; colours, opacities, stroke widths and font sizes are presentation attributes on each element, theme colours reading `var(--_x)` aliases on the root `style` (the `cScale` slots are literal colours) | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| Everything in one `<g transform="translate(cx, cy)">`; the legend rows in `<g transform="translate(x,y)">` | No transforms: every element in root coordinates | The layout places everything |
| Each axis a `<line>` and a `<text text-anchor dominant-baseline>`, siblings | Each axis a `<g data-id data-ast="axis:<name>">` holding its `line.radarAxisLine` and `text.radarAxisLabel`; the label's box sits where v12's anchor and baseline put it | One element per axis maps it to its source (R-PARSE-8) |
| Axis labels placed by `text-anchor` (`start`/`end`/`middle` by the angle) and `dominant-baseline` (`hanging`/`auto`/`central`) at a point; the legend text `start`-anchored, `hanging` | Every label is placed by its measured box (core label layout): the box sits where v12's anchor and baseline put one line, and the text is drawn in it (`text-anchor="middle"` at the box centre, the legend `start` at its left edge), with no `dominant-baseline`. One line lands where v12's did; extra lines grow away from the chart | D355 |
| Curves: `<path class="radarCurve-<i>">` (circle graticule) or `<polygon>`, no source mapping | The same, with `data-id` and `data-ast="curve:<name>"`; a skipped curve has no element but keeps its index, colour slot and legend row | R-PARSE-8, pitfall 12 |
| Legend row: `<g transform>` with `<rect class="radarLegendBox-<i>" width="12" height="12">` and `<text x="16" class="radarLegendText">` | `<g data-id="curve:<name>">` with the `rect` (`data-id` too) and a start-anchored `text`, in root coordinates; no `data-ast` (the curve's shape carries it) | R-PARSE-8, D359 |
| `<text class="radarTitle">` always written, empty when there is no title | Written only when there is a title, with `data-ast="title"` (`title@2`, … for the last of several) when it comes from the text; a front-matter title (D218) has no `data-ast` | Nothing invisible is drawn |
| Labels, legend and title set with d3 `.text()`: `<br>` and tags printed as written, a newline collapsed to a space | Core's label layout: `<br>` and newlines break the line, markdown strings render, math and icons work, entities decode. A label of several lines grows away from the chart; legend rows below it move down | D355 |
| A fixed `viewBox` (the 700 × 700 canvas by default) that axis labels, wide legend labels, a fractional-`ticks` ring and a large title overflowed (clipped in `<img>` and server renders) | v12's positions; the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover everything drawn and may start at a negative `x` or `y`. A chart where everything fits keeps v12's canvas | D354 |
| The legend always at `¾` of the way to the canvas's top-right corner, so a long axis label at the top right (start-anchored, growing right) could lie under a legend row | The legend keeps v12's position unless a row meets an axis label; then the whole legend moves right, 4 px past that label, and the `viewBox` grows to cover it. Rows keep their `y` | D614, #846 |
| `look: neo` and the redux themes: the same chart as the classic themes | The same: radar differs between families by colour only (computed styles checked in `neo` and `neo-dark`) | D227 |

## Treemap

The treemap parser accepts the v12 language, `treemap` and `treemap-beta` (oracle parity over
every e2e fixture, the v12 spec strings and the syntax page; grammar in
[syntax/treemap.md](./syntax/treemap.md)). Layout, value formatting and colours are v12's (spec
#428). What changes:

| v12 | v13 | Why |
| --- | --- | --- |
| Syntax errors: Langium's first message, naming tokens (`Expecting: one of these possible Token sequences: …`) | Every error, in words. The traps v12 has are kept, each with its own diagnostic: a blank at the end of a line before an indented row is an error that names it; a trailing blank or `%%` comment that indents the next row warns `TREEMAP_TRAILING_BLANK`; two rows on one line warn `TREEMAP_ROWS_ON_ONE_LINE`; a `classDef` with no styles that takes the next line warns `TREEMAP_CLASSDEF_NEXT_LINE`; a one-character class name is an error saying class names need two characters | D401 |
| A value `parseFloat` cut short (`1_000` as 1, `1,2,3` as 123) was drawn silently; `.` gave `NaN` and drew a `NaN` rectangle | The same numbers, with one `TREEMAP_INVALID_VALUE` warning per render listing them; a `NaN` leaf takes no area and prints no value | D402 |
| A leaf's group had the class `leaf<i> <class>x` (a stray `x`), so CSS written for the class never matched | `leaf<i> <class>`; inline styles apply as before | D403 |
| A leaf directly under the root drew with no fill and no stroke (the hidden root takes the scales' first slot, `transparent`) | The same: kept | D404 |
| Section colours wrapped round all 13 slots of the fill scale, so the 13th distinct section name (and the 26th, …) took the root's `transparent`: no fill, no outline, and its leaves floated on the canvas | Sections cycle through `cScale0`–`cScale11` and skip the root's slot: the 13th name takes `cScale0`, the 14th `cScale1`, and so on. Every section from the 13th distinct name on is one colour away from v12; diagrams with 12 or fewer section names are unchanged | D612 |
| Labels and values fitted with `getComputedTextLength()` in the browser and clipped to their box | The same fitting rules (shrink 1 px at a time, section headers truncated with `...`), measured by the injected measurer; text is kept inside its box instead of clipped: a section label or value that does not fit is left out, and the label of a treemap of more than 20 leaves that is still too wide at the smallest size is truncated with `...`. Entities decode and tags print as text | D405 |
| `valueFormat` passed to d3-format, with v12's own `$0,0`, `$…,…` and `$x` cases; a specifier d3 rejects fell back to `,`, and `$` with such a rest (`$abc`) threw | d3-format's specifier grammar re-implemented in the package, with v12's `$` cases: every specifier formats as in v12. `$abc` falls back to `,` too | D409 |
| A `treemap` config value of the wrong type or a negative length (`padding: -5`, `nodeWidth: "wide"`) was used as it was | A number, or a numeric string as its number, of 0 or more; anything else draws with the default and one `TREEMAP_CONFIG_INVALID` warning per key. `nodeWidth`/`nodeHeight` of 0 still draws v12's 960 × 500 canvas, and an empty `valueFormat` is `,` | D226 |
| The `treemap` section's `borderWidth`, `valueFontSize` and `labelFontSize` had defaults and were never read | Accepted and ignored, with no warning ([Config](#config)) | |
| `themeVariables.treemap.*`: of the twelve keys v12's styles read, only `titleColor` and `titleFontSize` took effect (the section and leaf rules never matched, the label and value rules lost to inline attributes) | `titleColor` and `titleFontSize` set `treemapTitleColor` and `treemapTitleFontSize` (also flat; the flat name wins when both are set). `sectionStrokeColor`, `sectionStrokeWidth`, `sectionFillColor`, `leafStrokeColor`, `leafStrokeWidth`, `leafFillColor`, `labelColor`, `labelFontSize`, `valueColor` and `valueFontSize` are accepted and change nothing, as in v12 | D407, D335, D540 |
| `look: handDrawn` (top level or `treemap.look`): v12 never sketched a treemap | Without `@mermaid-js/plugin-hand-drawn`, `look` is ignored with one `LOOK_REMOVED` warning, as in every section. With the plugin, `look: handDrawn` turns `handDrawn` on with no warning, and the treemap draws exactly as without it: not sketched | D301, D303 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |

### Treemap theme colours

Treemap reads the shared `cScale` and `cScaleLabel` palettes (v12's values in every theme, D258)
and owns `cScalePeer0`–`cScalePeer11`, the section outlines (CSS `--mermaid-cScalePeer0`, …; an
author's `cScalePeer<n>` is drawn as given, as in v12). v13 derives each peer from its `cScale`
slot by one rule, the theme's `dark` trait: `lighten(cScale<i>, 10)` in a dark theme or under
`darkMode`, `darken(cScale<i>, 10)` otherwise, and the same rule over an author's `cScale<n>`.
With each theme's own slots, that is what v12 drew in `base`, `neutral`, `neo`, `redux`,
`redux-color` and `dark`; v12 used another step in `default` (15 points) and `forest` (25), the
light branch in the three dark redux and neo themes, and another rule for an author's `cScale<n>`
in `redux`, `base` and `neo`. `treemapTitleFontSize` is 14 px, as v12's `.treemapTitle`, and
`treemapTitleColor` follows core's `titleColor`, which differs from v12's in `base`, `redux` and
`redux-color`. What changed (`packages/conformance/src/treemap/theme.spec.ts` lists each one);
only section outlines and the title change:

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `default` | Peers from `darken(cScale<i>, 25)` (15 HSL points under the drawn slot, as `updateColors()` darkens the slot again), slots 1 and 2 from `darken(secondaryColor, 45)` and `darken(tertiaryColor, 40)` | The light rule: 10 points under every slot, so the outlines are a little lighter | D406, D541 |
| `forest` | Peers from `darken(cScale<i>, 25)`, slots 1 and 2 from the secondary and tertiary colours | The light rule: 10 points under every slot | D406, D541 |
| `default`, `forest` with `darkMode` | The same peers: v12 derived them in the theme's constructor, before `darkMode` was applied | The dark rule: 10 points over every slot, as in `base` and `neutral`, where v12 switched too | D406, D571 |
| `redux-dark` | The light branch (the theme sets no `darkMode`): peers 10 points under the slot, so on its black slots the same black | The dark rule: 10 points over every slot, so the outlines show on the dark fills | D406 |
| `redux-dark-color` | The light branch: peers 10 points under the slot | The dark rule: 10 points over every slot | D406 |
| `neo-dark` | The light branch: peers 10 points under the slot, so on its black slots the same black | The dark rule: 10 points over every slot | D406 |
| `redux`, `base`, `neo` | An author's `cScale<n>` moved its peer by another rule: `redux` kept the theme's own peer, `base` and `neo` darkened the author's slot by 35 points | The theme's rule over the author's slot (10 points), as without the override | D406 |
| `base` (with or without `darkMode`), `redux`, `redux-color` | The title in v12's `titleColor` (`rgb(8.5, 5.75, 0)` in `base`, `#000000` in the redux themes) | Core's `titleColor` (`#333333`, `#28253d`), which every type's titles take | D407, R-THEME-9 |

## Treemap SVG structure

What changed in the treemap's SVG compared with v12 (spec #428, DESIGN §7.2). v12's class names
are kept (`treemapTitle`, `treemapContainer`, `treemapSection`, `treemapSectionHeader`,
`section<n>`, `treemapSectionLabel`, `treemapSectionValue`, `treemapNode`, `treemapLeafGroup`,
`leaf<n>`, `treemapLeaf`, `treemapLabel`, `treemapValue`), and so are the rectangles, the paints
and the draw order.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="treemap"`, and `class="flowchart"` from v12's `setupViewPortForSVG(…, 'flowchart', …)` | No root `id` and no `flowchart` class; `class="mermaid mermaid-treemap"`, `role="img"`, `aria-roledescription="treemap"`, `data-mermaid-version`, `font-family`; the `viewBox` is the bounding box of what is drawn, padded by `diagramPadding`, as v12 measured it | R-SEC-2, R-A11Y-1, D224 |
| A `<style>` scoped by the id; its one effective rule, `.treemapTitle`, gave the title's fill and size | No `<style>` (except under `theme: 'auto'`, core's light/dark sheet): the title carries `fill` (`treemapTitleColor`) and `font-size` (`treemapTitleFontSize`), colours reading `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), host re-theming with `--mermaid-*` (R-THEME-3) |
| A `<clipPath>` per section and leaf (`clip-section-<id>-<i>`, `clip-<id>-<i>`) and `clip-path` on their texts | No `clipPath`: text is fitted, truncated or left out so it stays inside its box | D405, R-SEC-2 |
| `g.treemapContainer` moved down by the title band and each group moved to its box with `transform`, rects at 0,0 | No transforms: every rect and text has absolute `x`/`y` | The layout places everything |
| The hidden root drawn as `g.treemapSection` (`section0`) with `display: none` on its four children, and with no rows as one transparent `leaf0` | Not drawn (it still counts, so sections start at `section1`); with no rows there is no `g.treemapContainer` | Nothing invisible is drawn |
| A leaf label or value that did not fit written with `display: none`; an empty section value for 0; an empty label when truncation left nothing | Left out | Nothing invisible is drawn |
| Leaf groups `treemapNode treemapLeafGroup leaf<i> <class>x` | `treemapNode treemapLeafGroup leaf<i> <class>` | D403 |
| Inline `style` attributes (class styles with `!important`, and `white-space`, `overflow`, `text-overflow` on texts) | Presentation attributes: `fill`, `stroke`, `font-*`, `text-anchor`, `dominant-baseline`. `classDef` styles are checked: an unsupported property or unsafe value is dropped with `STYLE_PROPERTY_DROPPED` / `STYLE_VALUE_DROPPED` | R-SEC-2 |
| No source mapping | Each section's and leaf's group carries `data-id` and `data-ast` (`node:<name path>`, `@2` for a repeated path), their rects and texts `data-id`; an in-text title's text carries both (`title`) | R-PARSE-8, D408, pitfall 12 |
| `look: neo` and the redux themes: the same treemap as the classic themes | The same: treemap differs between families by colour only | D227 |

## Cynefin SVG structure

What changed in the cynefin diagram's SVG compared with v12 (spec #423, D361–D366). v12's groups
and classes are kept, in v12's order, inside one `<g transform="translate(padding,padding)">`:
`g.cynefin-backgrounds` (`rect.cynefinDomain`, complex, complicated, chaotic, clear),
`g.cynefin-boundaries` (`path.cynefinBoundary` ×2, `path.cynefinCliff`), `path.cynefinConfusion`,
`g.cynefin-labels` (`text.cynefinDomainLabel`), `g.cynefin-subtitles` (`text.cynefinSubtitle`,
only with `showDomainDescriptions`), `g.cynefin-items` (always; a translated `g` per item with
`rect.cynefinItem` or `rect.cynefinItemOverflow` and `text.cynefinItemText`), `g.cynefin-arrows`
(only with transitions) and `text.cynefinTitle`. Selectors that use these classes keep working.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="cynefin"`, a `<style>` scoped by the id that gave every stroke, font size, weight and text colour | No root `id`; `class="mermaid mermaid-cynefin"`, `role="img"`, `aria-roledescription="cynefin"` (kept), `data-mermaid-version`; no `<style>` (except `theme: 'auto'`): every fill, stroke, width, dash, opacity and font is a presentation attribute, colours reading `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3, D152) |
| `<title>` and `<desc>` written twice: once by the renderer without ids, once with ids (`chart-title-<render id>`, `chart-desc-<render id>`) by the accessibility step | One `<title id="<id>-title">` (from `accTitle` only) and one `<desc id="<id>-desc">` | D133 |
| Arrowheads: `<defs><marker id="cynefin-arrow-<render id>">` after the root `<g>`, referenced by `marker-end` on each line | No `<marker>`, `<defs>` or id: each transition is `path.cynefinArrowLine`, then a `path.cynefinArrowHead` (v12's marker triangle, `6 × arrowWidth` long, its tip `0.1` of that past the line end as `refX 9` put it), then `text.cynefinArrowLabel` | `<marker>` and `marker-end` are not in the allow-list, and the id broke R-SEC-2 |
| No source mapping | `data-ast` on the drawn block of each declared domain (its quadrant `rect` or the ellipse), on each item `g` and on each transition's line; `data-id` (domain name, item label, or `from-to`) on those and on labels, subtitles, arrowheads and arrow labels, which carry no `data-ast`. Undeclared quadrants have `data-id` but no `data-ast`. Replaced blocks, dropped self-loops and confusion items past the third have no element; the `+N more` badge that stands for those items carries neither attribute | One `data-ast` element per AST node (R-PARSE-8, pitfall 12) |
| Texts placed with `dominant-baseline` (`middle`, `central` for items, `auto` for arrow labels) | Each text placed by its measured baseline, at the same centre | Core's label layout |
| Items, transition labels and the title set with d3 `.text()`: `<br>` and tags printed as written, entities decoded | Core's label layout ([Labels and text](#labels-and-text)): `<br>` breaks the line, markdown strings, entities, math and icons render; a badge is at least 26 px tall and grows with its label's lines, a title or transition label of several lines grows up from where v12 drew its one line. The fixed domain texts and `+N more` stay plain | D363, D225 |
| Item widths measured with `getBBox()` after the CSS applied, or `label.length × 7` when it returned 0 | Measured in the font they are drawn in; no character-count fallback | Pitfall 16 |
| A fixed `viewBox="0 0 width+2·padding height+2·padding"`: a fifth quadrant item, confusion items below the ellipse, a wide title or one in a `padding` under about 18 ran off it | The same placement (D361), except that a long list grows its row (D617); the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover whatever is drawn past it, so it can start below 0. A diagram where everything fits keeps v12's | D361, D224 |
| Quadrants were always half the canvas: from the fifth item a domain's list ran over the horizon onto the next row's headings and items, or below the canvas | A row of quadrants grows to fit its longest list, reaching to where the list's next badge would start; the horizon, the confusion ellipse with its items, the cliff and the lower row move down with it, and the fold spans the taller canvas. The texts keep their place under the row's top edge, and transitions run between them. No item is hidden; `confusion` still shows three and a `+N more` badge. Lists of four one-line items or fewer keep v12's geometry | D617 |
| `seed: 0` (the default) hashed the SVG element id, so the waves changed with every render id | `seed: 0` hashes the render's `idPrefix` with v12's hash: deterministic for a given `id` option, different for two diagrams on a page. A non-zero `seed` draws v12's exact paths | D362, R-ARCH-6 |
| A later block of a domain silently replaced the earlier one's items | The same, with one `CYNEFIN_DUPLICATE_DOMAIN` warning per render naming the replaced blocks | D364, D226 |
| `x --> x` dropped with a console `log.warn`; repeated transitions drawn on top of each other | Dropped with one `CYNEFIN_SELF_LOOP` warning per render (the statement keeps its AST node); repeats drawn as v12 drew them | D365, D226 |
| Out-of-range or non-finite `width`, `height`, `padding` and `boundaryAmplitude` drawn as given (negative rect sizes, `NaN` in path data) | `width`, `height` and `padding` fall back to their defaults and `boundaryAmplitude` clamps to [0, 50], each with one `CYNEFIN_CONFIG_INVALID` warning per render; a non-finite `seed` counts as 0 | D366, D226 |
| `look: neo` and the neo and redux themes drew the same shapes as the classic themes | The same: cynefin differs between families by colour (and the theme's font family) only, with no gradient and no shadow. Checked against v12 12.2.0's computed styles in every theme, with and without `look: neo` | D215, D227 |
| `format: 'ascii'` | Throws `UnsupportedFormatError`: cynefin has no text output | D320 |

### Cynefin theme colours

v12 read `themeVariables.cynefin` (`complexBg` … `arrowWidth`). v13 keeps that nested object and
adds a flat name for each key (`cynefinComplexBg` … `cynefinArrowWidth`, CSS
`--mermaid-cynefinComplexBg`, …); the flat name wins when both are set (D335, D540). An author's
value wins in every theme, as in v12, and `boundaryWidth: 0` stays 0. The lengths (16, 12, 2, 4,
2) and the colours in `default`, `neutral`, `base` and `dark` are v12's. What changed
(`packages/conformance/src/cynefin/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `neo`, `redux`, `redux-color` | No cynefin block: `default`'s literals, so boundaries and arrows `#333333`, text `#333`, labels `#131300`, whatever the theme's own colours, and a `lineColor` override changed nothing | Boundaries and arrows in the theme's `lineColor`, text in its `textColor`, labels in its `primaryTextColor` (`#000000`, `#333333`/`#28253d`, `#333333`/`#28253d`); a `lineColor` override moves them | D333(b), R-THEME-11 |
| `neo-dark`, `redux-dark`, `redux-dark-color` | `default`'s light literals: pale backgrounds (`#E8F5E9` …), cliff `#8B0000`, dark inks on a dark page | `dark`'s entry: backgrounds `#1B5E20` `#0D47A1` `#BF360C` `#F57F17` `#4A148C`, cliff `#FF6B6B`, and the theme's own line, text and label colours (`#cccccc`, `#cccccc`, `#e0dfdf`) | D333(b), R-THEME-11 |
| `forest` | Its own backgrounds `#C8E6C9` `#DCEDC8` `#FFE0B2` `#FFF9C4` `#D7CCC8` and cliff `#8B4513` | `default`'s backgrounds and cliff `#8B0000` (forest's own lines and inks are kept). Set `themeVariables.cynefin` to draw v12 forest's | D541 |

## Sankey

- **Detection:** `sankey` and `sankey-beta` are detected by v12's case-sensitive detector with
  no word boundary, between `quadrantChart` and `packet` as in v12. So `sankeyx` is detected as
  a sankey diagram and then rejected as a syntax error (`SYNTAX`), and `Sankey` is not detected
  at all (`UNSUPPORTED_DIAGRAM`), as in v12. The language service, CodeMirror and Monaco know it.
- **Syntax** is v12's CSV: a differential test runs v12 and v13 over every e2e fixture and the
  v12 spec and docs examples, and the grammar is in [syntax/sankey.md](./syntax/sankey.md).
  Every error is reported, not only the first, with messages in words and a range at the field
  (R-PARSE-4). Names stay printable ASCII, quotes and `""` as in v12.
- **Cycles** (D393): a self-link or any cycle parsed in v12 and then threw d3-sankey's bare
  `circular link` at render. It is now a parse error at the cycle's first row,
  `Sankey diagrams cannot have circular links, and "<node>" is part of one.`, one per group of
  nodes that reach each other; the diagram is still rejected (`SYNTAX`), and the language
  service reports it.
- **Values** (D394): a value that is not a number, negative or infinite counts as 0, where d3
  drew `NaN` or negative boxes, with one `SANKEY_INVALID_VALUE` warning per render naming every
  such row. Zero links are still drawn 1 px wide, as in v12. A value with text after its number
  (`1 2`, `1;`) is still read by `parseFloat`, with one `SANKEY_VALUE_TRAILING_TEXT` warning
  per such value.
- **Labels** (D395) read as v12 drew them, one line `<name> <value>`, and the front-matter
  `title` is the accessible name, never drawn (D396): see
  [Sankey SVG structure](#sankey-svg-structure).
- **Config.** The `sankey` section is honoured with v12's defaults: `width` (600), `height`
  (400), `linkColor` (`gradient`), `nodeAlignment` (`justify`), `nodeWidth` (10), `nodePadding`
  (12), `showValues` (true), `prefix` and `suffix` (empty), `labelStyle` (`legacy`),
  `nodeColors` (none) and `useMaxWidth`, whose default is `true`: v12's schema documented
  `false`, but its bundled defaults held `true`, so every sankey without the key drew
  `width="100%"` with a `max-width`, and v13 keeps that. A length is a number of 0 or more or a
  numeric string as its number; a negative or non-numeric length, an unknown `nodeAlignment` or
  `labelStyle` and a value of the wrong type lay out with the default and warn
  `SANKEY_CONFIG_INVALID`, once per key (v12 passed them to d3 as they were: a negative
  `nodePadding` overlapped nodes, and a string one was concatenated with 15). A `linkColor` or
  `nodeColors` value that fails the colour check, a misspelt colour included (D690), is dropped,
  the default drawn (the gradient, or the node's next Tableau10 colour), with one
  `SANKEY_COLOR_INVALID` warning per render naming each. `useWidth` is ignored (v12's
  sankey never read it), and `look` as everywhere (D153).
- **Text output** (`format: 'ascii'`) throws `UnsupportedFormatError` (D320), and sankey is not
  sketched under `look: handDrawn`, as v12 never sketched it (D301).
- **Limits** (R-SEC-5): a diagram may have up to `limits.maxNodes` nodes (10,000) and
  `limits.maxEdges` links (5,000); over either, render rejects with a `LIMIT` `MermaidError`.
  v12 had no such limit. Only the integrator can raise them ([Limits](#limits)).

## Sankey SVG structure

What changed in the sankey's SVG compared with v12 (spec #427, D391, D392, D395–D397). v12's
groups and classes are kept, in v12's order, so selectors that use them keep working:
`g.nodes` holds one `g.node` per node (translated to its corner, holding its `rect`), then
`g.node-labels` (`font-size="14"`) one `text` per node (`text.sankey-label-bg` for every node,
then `text.sankey-label-fg` for every node, under `labelStyle: outlined`), then `g.links`
(`fill="none"`, `stroke-opacity="0.5"`) one `g.link` per row holding its `path`. Nodes are in
first-appearance order and links in row order, as in v12.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="sankey"`, a `<style>` scoped by the id, an empty leading `<g>`, `width="100%"` and `max-width` unless `sankey.useMaxWidth: false` | No root `id`; `class="mermaid mermaid-sankey"`, `role="img"`, `aria-roledescription="sankey"` (kept), `data-mermaid-version`; no `<style>` (except `theme: 'auto'`); `width="100%"` and `max-width` unless `sankey.useMaxWidth: false`, as in v12. The `viewBox` is still what is drawn with no padding, now measured: nodes, label boxes (with the outline's halo), and link strokes | Inert output (R-SEC-2), D224 |
| Each `g.node` had `id="node-<n>"` and stray `x`/`y` attributes; each link's gradient `id="linearGradient-<n>"`, numbered across every diagram on the page | No element id but `<render id>-title` (below) and the gradients' (below) | No colliding ids (R-A11Y-1) |
| No title: the front-matter `title` was neither drawn nor the accessible name | Still not drawn; when the front matter has a `title`, it becomes `<title id="<render id>-title">` and the root's `aria-labelledby`, since sankey has no `accTitle` syntax. D133 keeps the title out of the accessible name of types with `accTitle`; ishikawa, which has none either, does the same (D492) | D396 |
| No source mapping | `data-id` and `data-ast` on each `g.node` (`node:<name>`) and `g.link` (`link:<source>-><target>`, `@2`, `@3` for repeated rows); labels carry `data-id` only (`%`, `>`, `@` and `#` in names percent-encoded) | One `data-ast` element per AST node (R-PARSE-8, D397) |
| `linkColor: gradient` (the default): a `<linearGradient gradientUnits="userSpaceOnUse" x1 x2>` with stops at `0%`/`100%` inside each `g.link`, before its path | The same gradient (from the source's colour at its right edge to the target's at its left edge), written by the writer into the root's `<defs>` with `y1="0" y2="0"` and stops at `0`/`1`, its id `<scope>-g-<hash of its ends and colours>`: links with the same ends and colours share one, and two diagrams on a page never collide | D391 |
| `linkColor: source`, `target` or a CSS colour stroked the path as given, the literal unchecked | The same strokes; a value that is none of the three modes and fails the colour check draws the default gradient, with one `SANKEY_COLOR_INVALID` warning | R-SEC-2, D690 |
| `style="mix-blend-mode: multiply"` on each `g.link`, and again in `.link` in the `<style>` | `style="mix-blend-mode:multiply"` on each `g.link` only: crossing links still darken where they overlap, and on dark pages too | D392 |
| Labels: `id\n<prefix><value><suffix>` set with d3 `.text()`, drawn on one line; `dy="0em"`, or `dy="0.35em"` with `showValues: false`; `fill` from the root `<style>` (`textColor`) | The same one line with a blank between the name and the value (D395); `dy` in px (`0`, or `4.9`, 0.35 × 14); `fill` on `g.node-labels`, the theme's `textColor` | D395, D152 |
| `labelStyle: outlined`: `.sankey-label-bg` stroked `mainBkg` (`|| background || '#fff'`), 4 px, round joins, `paint-order: stroke`, under `.sankey-label-fg` filled `textColor` | The background text carries `stroke` (`mainBkg`), `stroke-width="4"` and `stroke-linejoin="round"` as attributes, with no `paint-order`: the foreground text drawn over it gives the same picture | Allow-list (no `paint-order`), D215 |
| `.node rect { shape-rendering: crispEdges }` | Not written: the allow-list has no `shape-rendering`, so node edges are anti-aliased | Allow-list |
| Node fills: a `nodeColors` entry as written, else the next of d3's `schemeTableau10`; an entry that was no colour (a number, `red;x`, `redd`) drew the node black, and links stroked from it black or not at all, and took no slot | The same for an entry that passes the colour check; any other entry is dropped and the node takes the next Tableau10 slot, as if it were not listed, so later nodes may take other slots than in v12 | D152, R-SEC-2, D690, spec #427 §Integration |
| `look: neo` and the neo and redux themes drew the same shapes as the classic themes (no `data-look` on sankey rects, so the neo rules missed them) | The same: sankey differs between families by `textColor`, `mainBkg` and the font family only. Checked against v12 12.2.0's computed styles (`default`, `dark`, `neo` with `look: neo`) | D215, D227 |

## Wardley map

The Wardley parser accepts the v12 language (oracle parity over every e2e fixture, the v12 spec
strings and the syntax page; grammar in [syntax/wardley.md](./syntax/wardley.md)). What changes
in config and drawing (spec #430):

| v12 | v13 | Why |
| --- | --- | --- |
| `wardley-beta` settings were read from `initialize()` only: the section is not in v12's `defaultConfig`, so its sanitiser dropped it from front matter and `%%{init}` (`width` stayed 900) | `wardley-beta` is honoured from every source: `initialize()`, front matter (`config: wardley-beta: …`), `%%{init: {"wardley-beta": …}}` and an init `config` key. Documents that set it today get what they asked for | D421 |
| A `wardley-beta` value below its minimum or of the wrong type was used as it was: `width: 0`, `nodeRadius: 0` or `padding` of half the canvas drew nothing, `"wide"` drew `NaN` | A number, or a numeric string as its number, at or above the key's schema minimum (`nodeRadius` above 0); anything else draws with the default and one `WARDLEY_CONFIG_INVALID` warning per key. A padding that leaves no chart falls back to 48, or to 0 where 48 leaves none either | D424, D226 |
| `size [0, 0]` (or any dimension below 1) drew a 0 × 0 view box | The dimension falls back to the config's `width` or `height`, with one `WARDLEY_CONFIG_INVALID` warning | D424 |
| `evolution` boundaries outside [0, 1] (`B@40.0`) drew stages off the chart | Clamped to [0, 1] when drawn, with one `WARDLEY_STAGE_CLAMPED` warning; decreasing boundaries still draw backwards, as in v12 | D424 |
| No codes: v12 dropped what it could not draw without a word (a link to an unknown name or to itself, an `evolve` naming no node, a second `pipeline` for a parent), read `1.5` as 1.5 % silently, and threw a plain `Error` at the first coordinate above 100 or `pipeline` naming no node | New codes. Warnings, in `RenderResult.warnings` (each with the `astIds` of the statements involved) and in the language service (one per kind, the other places in `related`): `WARDLEY_CONFIG_INVALID` and `WARDLEY_STAGE_CLAMPED` (the rows above), `WARDLEY_LINK_DROPPED`, `WARDLEY_UNKNOWN_TARGET`, `WARDLEY_PIPELINE_REPLACED` and `WARDLEY_COORDINATE_AMBIGUOUS` (a coordinate in (1, 2)). Errors, with v12's message, every one reported (`render()` rejects with a `SYNTAX` `MermaidError` whose `diagnostics` carry the codes): `WARDLEY_OUT_OF_RANGE` and `WARDLEY_UNKNOWN_PARENT` | D424, D425, D428, R-PARSE-4 |

### Wardley theme colours

v12 read `themeVariables.wardley` (`backgroundColor` … `annotationFill`) and the flat
`wardleyEvolutionColor`, and only the five classic themes set them. v13 keeps the nested object
and adds a flat name for each key (`wardleyBackgroundColor` … `wardleyAnnotationFill`, CSS
`--mermaid-wardleyAxisColor`, …); the flat name wins when both are set (D335, D540). The colours
in `default`, `forest`, `base` and `dark`, and in `neutral` but its grid, are v12's. What changed
(`packages/conformance/src/wardley/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `redux` | No `wardley` block: the renderer's fallbacks, the theme's own `background` and text, black strokes, white fills, `#dc3545` trends and a translucent grey grid (`rgba(100, 100, 100, 0.2)`) | The same colours, but the grid in `lightgrey` | D333(b) |
| `redux-color` | No `wardley` block: as `redux` | The same colours, but the grid in `lightgrey` | D333(b) |
| `neo` | No `wardley` block: as `redux` | The same colours, but the grid in `lightgrey` | D333(b) |
| `redux-dark` | No `wardley` block: black axes, strokes and links, white component fills and `#dc3545` trends on the dark page; the annotation markers and box white, as in every theme (D426) | Axes, strokes and links in the theme's `lineColor` (`#cccccc`), component and annotation fills `mainBkg` (`#111113`), trends `#ff6b6b`, the grid `lightgrey`; anchor labels, stage dividers and annotation markers follow (D426) | D333(b), D426 |
| `redux-dark-color` | No `wardley` block: as `redux-dark` | As `redux-dark`: `#cccccc` lines, `#111113` fills, `#ff6b6b` trends | D333(b), D426 |
| `neo-dark` | No `wardley` block: as `redux-dark` | As `redux-dark`, with fills `#2a2020` | D333(b), D426 |
| `neutral` | The grid in the theme's `gridColor`, `hsl(0, 0%, 90%)` | The grid in `lightgrey`, as in the other themes (`wardleyGridColor` is a literal, gantt's) | #430 |
| `base` | Anchor labels and stage dividers `#000`, annotation markers and box white | Anchor labels `#333333`, dividers `#0b0b0b` (the axis colours), markers and box `#f4f4f4` (`wardleyAnnotationFill`, the background) | D426 |
| `dark` | Anchor labels and stage dividers `#000` on the `#333` page, annotation markers and box white | Anchor labels `#e0dfdf`, dividers `lightgrey`, markers and box `#1f2020` (`mainBkg`) | D426 |
| `base` with `darkMode: true` | Labels and annotation text `#eeeeee` | The theme's `primaryTextColor`, `#333333` (core keeps text colours under `darkMode`) | D571 |
| `default` with an author `wardleyEvolutionColor` | Ignored: `default` built its `wardley` block before the author's values were applied | The trends follow it, as in the other themes. An author `background`, `lineColor` or `primaryTextColor` is still ignored in `default`, as in v12 (D656) | R-THEME-4, D656 |

## Wardley SVG structure

What changed in the Wardley map's SVG compared with v12 (spec #430, #493). v12's groups and
classes are kept, in v12's order, as the children of `g.wardley-map`: `rect.wardley-background`,
`text.wardley-title`, `g.wardley-axes` (two lines, `text.wardley-axis-label
wardley-axis-label-x`, `-y`), `g.wardley-stages` (each divider line before its
`text.wardley-stage-label`), `g.wardley-grid`, `g.wardley-pipelines` (`rect.wardley-pipeline-box`),
`g.wardley-pipeline-links` (`line.wardley-pipeline-evolution-link`), `g.wardley-links`
(`line.wardley-link`, `wardley-link--dashed`, then every `text.wardley-link-label`),
`g.wardley-trends` (`line.wardley-trend`), `g.wardley-nodes` (`g.wardley-node
wardley-node--<anchor|component|pipeline-component>` holding the strategy overlay
`circle.wardley-<build|buy|outsource|market>-overlay`, the circle, `line.wardley-market-line` and
`circle.wardley-market-dot`, the pipeline parent's square, `line.wardley-inertia` and
`text.wardley-node-label`), `g.wardley-annotations` (`g.wardley-annotation` per marker, then
`g.wardley-annotations-box`), `g.wardley-notes`, `g.wardley-accelerators` and
`g.wardley-deaccelerators`. Selectors that use these classes keep working.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="wardley"`; the renderer wiped the SVG first, so Mermaid's `<style>` was gone and every colour, width and font size was a presentation attribute | No root `id`; `class="mermaid mermaid-wardley"`, `role="img"`, `aria-roledescription="wardley"` (kept), `data-mermaid-version`; still presentation attributes, the theme colours reading `var(--_x)` aliases on the root `style`; `<style>` only for `theme: 'auto'` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| Arrowheads: `<defs>` with three `<marker>`s (`arrow-<id>`, `link-arrow-end-<id>`, `link-arrow-start-<id>`) after `g.wardley-map`, referenced by `marker-start`/`marker-end` | No `<defs>`, `<marker>` or id: `path.wardley-link-head` after a link's line for each end that flows (`+>`, `+<`, both for `+<>`), `path.wardley-trend-head` after each trend's line, v12's marker triangle (5 × 5 and 6 × 6, the tip a tenth past the line end as `refX 9` put it), filled in the line's colour | `<marker>` is not in the allow-list, and the ids broke R-SEC-2 (R-ARCH-6) |
| No source mapping | `data-ast` (with the same `data-id`) on each node's `g.wardley-node`, each link's and trend's line, each pipeline box, note, annotation marker `g` and (de)accelerator outline, the annotation box `g`, the in-text title (`title@2`, … for the last of several; a front-matter title has none) and, for an `evolution`, `g.wardley-stages`; the parts drawn for them (labels, heads, joins) carry its `data-id` only. A repeated `component`, which v12 merged, and a dropped link have no element | One `data-ast` element per AST node (R-PARSE-8, pitfall 12) |
| `g.wardley-links`, `g.wardley-trends` and `g.wardley-nodes` always written, and `g.wardley-pipeline-links` with any pipeline, empty when there was nothing to draw | A group with nothing in it is left out | No empty elements |
| A `viewBox` and background of the canvas (`0 0 width height`): labels and accelerators near an edge ran off it (clipped in `<img>` and server renders) | v12's positions; the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover everything drawn and may start at a negative `x` or `y`, and the background covers the `viewBox`. A map where everything fits keeps v12's canvas | D224 |
| No font: with the `<style>` wiped, text took the browser's default (often a serif) | The theme's `fontFamily` on the root; v12's sizes and weights | D422 |
| Texts set with d3 `.text()`; `font-weight="normal"` and `dominant-baseline="auto"` written on component labels | The same one literal line (no `<br>` or markup; a `#amp;` code shows as `&`, a literal `&amp;` as written), at v12's anchor and alignment; the default `normal` and `auto` are left out | v12's `.text()` (#490, #493) |
| `#name;` codes: v12 wrote `&name;` into its SVG, which a browser draws from the full HTML table (`#alpha;` as α) | `#name;` codes outside core's entity table draw as written (`#alpha;`, D561); core's names (`#amp;`, `#nbsp;`, `#hellip;`, `#hearts;`, … about 50) and every numeric code (`#945;`) still draw their character. Write a numeric code for any other | Core's table (R-PERF-8); parity lists it (`entities-outside-core`) |
| Anchor labels and stage dividers `#000` in every theme, black on `dark`'s `#333` | Anchor labels in `wardleyAxisTextColor`, stage dividers in `wardleyAxisColor`, as the other labels and the axes: near v12's black in the light themes (labels / dividers `#131300` / `#333333` in `default`, `#333` / `#0b0b0b` in `base`, `#321b67` / `#000000` in `forest`, `#111111` / `#666` in `neutral`), readable in `dark` (`#e0dfdf` / `lightgrey`) | D426 |
| Annotation markers and box filled `white`, stroked `axisColor`, their text `axisTextColor`; `annotationStroke`, `annotationTextColor` and `annotationFill` read and never used | The three annotation variables colour them: the same in `default`, `forest` and `neutral`; `#f4f4f4` in `base`; in `dark` filled `mainBkg` (`#1f2020`) | D426 |
| Strategy overlays (`#666`, `#ccc`, `#eee` with a `#000` stroke), market circles and (de)accelerators (`white`) | Kept as v12's literals in every theme | D426 |
| `themeVariables.wardley.*` (nested only) and the flat `wardleyEvolutionColor` | Each key is also the flat variable `wardley<Key>` (`wardleyAxisColor`, … `wardleyAnnotationFill`); the nested key still works, the flat name wins when both are set, and `wardleyEvolutionColor` still feeds `wardleyEvolutionStroke` | D335, D540 |
| `look: neo`, hand-drawn and the redux and neo themes: the classic drawing | The same shapes: wardley differs between families by colour only, with no gradient, shadow or hand-drawn outline | D227, D301 |
| `format: 'ascii'` | Throws `UnsupportedFormatError`: wardley has no text output | D320 |

## XY chart

The XY chart parser accepts the v12 language for `xychart` and `xychart-beta` (oracle parity over
every e2e fixture, the v12 spec strings and the syntax page; grammar in
[syntax/xychart.md](./syntax/xychart.md)), and the layout is v12's orchestrator, checked against
v12's chart builder to 0.01 px. What changes in config and drawing (spec #426):

| v12 | v13 | Why |
| --- | --- | --- |
| Unquoted text lost the blanks between its words: `title Sales Report` drew `SalesReport`, `x-axis [jan feb, mar]` a first category `janfeb` | One space wherever blanks separate the words (`Sales Report`, `jan feb`); the ends are trimmed and quoted text is kept as written. A line break after a blank is one of the blanks; without one it still ends the statement | #683, as v12's fix mermaid-js/mermaid#8575 |
| `xyChart.useMaxWidth: false` was ignored: the chart always scaled to its container | Honoured: `false` writes the canvas's `width` and `height`; the default (`true`) is unchanged | D387 |
| A `%%{init: {"config": …}}` key went under the detected type, `xychart`, which nothing read | It goes to the `xyChart` section, as `initialize()`, front matter and `%%{init: {"xyChart": …}}` do (the plugin's `configSection`) | Choice, for the maintainer (#513) |
| A config value of the wrong type was used as it was: `width: "wide"` drew `NaN` sizes, `showDataLabel: "no"` counted as true | A number, or a numeric string as its number, for a number key, and a boolean for a boolean key; anything else draws with the default and one `XYCHART_CONFIG_INVALID` warning per key. Numbers outside the schema's range are still taken, as v12 took them (`plotReservedSpacePercent: 20`, a negative padding) | Choice, for the maintainer (#513), as radar's config row (D356) |
| A `chartOrientation` other than `horizontal` (`diagonal`, `HORIZONTAL`) drew a vertical chart, silently | The same vertical chart, with one `XYCHART_CONFIG_INVALID` warning | Choice, for the maintainer (#513) |
| 12.2.0's default config holds a `$ref` key in `xyChart.xAxis` and `yAxis` | Accepted and ignored, with no warning, so a copy of that config still works; the axes' defaults are their keys' own | Choice, for the maintainer (#513) |
| With `showDataLabel`, every bar plot was labelled with the values of the first plot, so a second bar plot (or a bar plot after a line) showed another plot's numbers; legend swatches got labels too | Each bar plot is labelled with its own values; legend swatches get none | D382 |
| A band axis with more categories than values wrote `NaN` bars and points | Those bars and points are not drawn, with one `XYCHART_MISSING_VALUE` warning | D383 |
| A line plot with a missing band value wrote `NaN` into the line's path | The line breaks there (d3's `defined` gap): the parts on either side are drawn, nothing joins them | Choice (#509) |
| Values past ±1e300 (a 309-digit number reads as `Infinity`) wrote `Infinity` or `NaN` coordinates | Drawn at ±1e300 | D383 |
| A range with `min = max` (given or inferred) mapped values to the middle of the axis | The same, with one `XYCHART_EMPTY_RANGE` warning | D383 |
| Data labels with no room in any bar wrote `font-size="Infinitypx"` | None are drawn, with one `XYCHART_LABEL_TOO_SMALL` warning | D383 |
| Data labels took the smallest size over every bar, so one bar with no room (the lowest bar of an automatic y range is a few px high) gave every label a size of 0 or less, which browsers drew at the inherited size | A bar with no room gets no label; the others are drawn at the smallest size that fits them. `XYCHART_LABEL_TOO_SMALL` only when no bar of a plot has room | D611, #537 |
| A plot written before its `x-axis` kept the x values of the axis it saw, silently; on a linear axis a category x had no position | The same, with one `XYCHART_PLOT_BEFORE_AXIS` warning naming the plots; a value with no x on the axis is drawn at the axis start, on a band and a linear axis alike | D386 |
| An unclosed `accDescr {` ended in an empty description, silently | The same, with one `XYCHART_UNCLOSED_DESCRIPTION` warning | #508 |
| `mermaid.parse()` accepted a chart with no plot (`xychart` alone); the render then failed with `No Plot to render, please provide a plot with some data` | Rejected at parse, with v12's message (`XYCHART_NO_PLOT`) | Choice, for the maintainer (#508) |
| A bar whose value is below the range minimum drew with a negative height, one above the maximum past the plot | The bar is held inside the plot box, its end at the box edge | Choice, for the maintainer (#509) |
| The title, axis titles, categories, legend names and line point labels were set with d3 `.text()`: `<br>` and tags printed as written | Core's label layout: `<br>` breaks the line (a legend name of several lines takes as many rows), math and icons work, entities decode; tick numbers and data labels stay plain text. Point labels are author text like the others (a choice, #509; D385 names the rest) | D385 |
| Line point labels in the line's colour | The same (near-white on the redux and base palettes, as in v12) | D384 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |

### XY chart theme colours

v12 read `themeVariables.xyChart` (`backgroundColor` … `plotColorPalette`), merged over
theme-default's block. v13 keeps that nested object and adds a flat name for each key
(`xyChartBackgroundColor` … `xyChartPlotColorPalette`, CSS `--mermaid-xyChartTitleColor`, …); the
flat name wins when both are set (D335, D540). `plotColorPalette` takes a comma-separated string, as
in v12, or an array; each theme's ten colours are v12's (D381). Every other value is v12's in all
eleven themes, but (`packages/conformance/src/xychart/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `redux` | No `dataLabelColor`: theme-default's `#131300` | The theme's `primaryTextColor`, `#28253d` | D333(b) |
| `redux-color` | No `dataLabelColor`: theme-default's `#131300` | The theme's `primaryTextColor`, `#28253d` | D333(b) |
| `redux-dark` | No `dataLabelColor`: theme-default's `#131300`. Inside a bar (the default) it reads well on the light plot palette (5.5–18.6:1); outside a bar (`showDataLabelOutsideBar`) it is barely visible on the `#333333` background (1.5:1) | The theme's `primaryTextColor`, `#e0dfdf`: readable outside a bar (9.5:1), but inside one it is about as light as the bar (1.0–1.5:1, 2.5:1 on the ninth colour), so labels inside bars are effectively invisible unless `xyChart.dataLabelColor` or `plotColorPalette` is set | D333(b) |
| `redux-dark-color` | No `dataLabelColor`: theme-default's `#131300`. Inside a bar (the default) it reads well on the light plot palette (5.5–18.6:1); outside a bar (`showDataLabelOutsideBar`) it is barely visible on the `#333333` background (1.5:1) | The theme's `primaryTextColor`, `#e0dfdf`: readable outside a bar (9.5:1), but inside one it is about as light as the bar (1.0–1.5:1, 2.5:1 on the ninth colour), so labels inside bars are effectively invisible unless `xyChart.dataLabelColor` or `plotColorPalette` is set | D333(b) |
| `neo` | No `dataLabelColor`: theme-default's `#131300` | The theme's `primaryTextColor`, `#333333` | D333(b) |
| `neo-dark` | No `dataLabelColor`: theme-default's `#131300`. Inside a bar (the default) it reads well on the light plot palette (5.5–18.6:1); outside a bar (`showDataLabelOutsideBar`) it is barely visible on the `#333333` background (1.5:1) | The theme's `primaryTextColor`, `#e0dfdf`: readable outside a bar (9.5:1), but inside one it is about as light as the bar (1.0–1.5:1, 2.5:1 on the ninth colour), so labels inside bars are effectively invisible unless `xyChart.dataLabelColor` or `plotColorPalette` is set | D333(b) |

## XY chart SVG structure

What changed in the XY chart's SVG compared with v12 (spec #426, #510). v12's class names are kept
(`main`, `background`, `plot`, `bar-plot-<n>`, `line-plot-<n>`, `chart-title`, `legend`,
`bottom-axis`/`left-axis`/`top-axis` with `axis-line`, `ticks`, `label`, `title`), and so is v12's
draw order.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"` and a `g.mermaid-tmp-group` used to measure text | No root `id` and no measuring group; `class="mermaid mermaid-xychart"`, `role="img"`, `aria-roledescription="xychart"`, `data-mermaid-version` and the theme's `font-family` | Inert output (R-SEC-2), no colliding ids (R-A11Y-1) |
| `<title>` and `<desc>` | Written only from `accTitle` and `accDescr`, with the ids `<id>-title` and `<id>-desc` | D133 |
| A fixed `viewBox` (the 700 × 500 canvas) | v12's positions; the `viewBox` grows to cover everything drawn (the axis strokes make the default 701 wide). The background `rect` is still v12's canvas | D224 |
| `width="100%"` and `max-width` always | The same by default; `width` and `height` with `xyChart.useMaxWidth: false` | D387 |
| Colours as fills and strokes from the `xyChart` block | Presentation attributes reading `var(--_x)` aliases on the root `style` (literal with `output.cssVariables: false`); the plot colours are always literal. Under `theme: 'auto'` the root has `data-p` and a theme `<style>` | R-THEME-3, R-THEME-8 |
| No source mapping | `data-ast` on the in-text title's `g.chart-title`, each plot's `g.bar-plot-<n>`/`g.line-plot-<n>` and each drawn axis's `g.<position>-axis`; `data-id` (the plot's AST id) on bars, lines, point labels, data labels and legend rows. The legend has no `data-ast` | R-PARSE-8, pitfall 12 |
| Paths as d3 wrote them | `M…L…` with two decimals (axis lines, ticks, legend strokes); a line plot's `d` keeps d3 `line()`'s three decimals | Core's path writer |
| Data labels' `font-size="<n>px"` | `font-size="<n>"` | Presentation attributes |
| A label with `<br>` printed as one `<text>` | A `<text>` of `<tspan>`s, one per line (core's label writer); a one-line text that v12's chart builder drew (title, axis text, legend names, point labels) is v12's `<text>` at `translate(x,y) rotate(r)` | D385 |
| Data labels placed with `x` and `y` | `x="0" y="0"` with `transform="translate(x,y) rotate(0)"`, as every other text; the same position | Choice (#510): one text writer |
| A plot whose values are all missing threw | The plot's group is written, with nothing drawn in it; a hidden axis part writes no group, an axis with every part hidden none at all | D383 |
| `look: neo` and the redux themes: the same chart as the classic themes | The same: the XY chart differs between families by colour only | D227 |

## Venn diagram

The venn parser accepts the v12 language (`venn-beta`; oracle parity over the corpus, grammar
in [syntax/venn.md](./syntax/venn.md)), and the layout is a port of venn.js 2.0.0, the solver
v12 drew with (D411): two- and three-set circles equal v12's. What changes (spec #429):

| v12 | v13 | Why |
| --- | --- | --- |
| The layout was solved twice per render: circles with venn.js's padding 15, text nodes and hand-drawn circles with `venn.padding` (8), so text sat on circles of another size (two sets: radius 210 against 217) | One solve, at an author's `venn.padding`, else 15: the circles are v12's, and text nodes and the hand-drawn sketch sit on them. `venn.padding`'s documented default is now 15 | D412 |
| Four or more sets: venn.js started from `Math.random`, so a diagram could change between renders | A fixed-seed start: the same diagram draws the same way every time. Four or more sets are not laid out as v12 laid them out | D413, R-ARCH-6 |
| Text nodes were HTML spans in a `foreignObject` that the browser wrapped; set and overlap labels were `tspan` lines measured with `getComputedTextLength()`, as many as venn.js's wrapping made | Both are SVG text laid out by core ([Labels and text](#labels-and-text)): `<br>`, the drawn tags (`<b>`, `<i>`, `<u>`, `<s>`, `<sub>`, `<sup>` and their synonyms), entities, math and icons work. Markdown is read only in a markdown string, a label or text node wholly in backticks (`` set A["`**bold** set`"] ``), which is drawn without its backticks; `**x**` without them stays as written. Labels wrap to the first set's radius and stop at three lines, the rest of the text joined into the third; text nodes wrap to their cell | D414, D225, D710 |
| Labels that the layout put on top of one another were drawn there | A label that would lie on an earlier area's label moves down below it, in v12's area order, and a repeated area's copies share one label. Measured on the corpus at four canvases: no label moves at the default 800 × 450, at 500 × 600 or at 300 × 300; at 1600 × 200 v12's labels collided and v13's move | #491 (kept because the layout invariant needs it) |
| Text nodes sat on the circles of a second solve (padding 8), labels on the drawn ones (padding 15); a text node could lie under an area's label, its own overlap's when it wraps to several lines, or a neighbouring one's | Text nodes sit on the drawn circles (D412), so they move by a few px (0 to 6 in the baselines: 0 for a centred overlap, 3.8 for `Terraform` under the triple overlap's label in `themes/*`). An area's text grid also moves down by what its own label reaches below one line, so a label of two or three lines (a `<br>` or a wrap, D414) stays above the area's text nodes; under a one-line label the grid is v12's. A text node can still lie under a label where v12's could: when the node wraps to several lines, in an area with three nodes or more, or under a neighbouring area's label. Only labels are kept apart from one another | D412, D613, v12's positions |
| `title "Team overlap"` (the syntax page's own example) drew its quotes | One pair of surrounding quotes is removed, as labels already lost theirs | D416 |
| `venn-beta` with no sets: the render threw | Draws only the title, with one `VENN_EMPTY` warning | D417 |
| A negative size was passed to venn.js; a size too large to square drew `NaN` | Laid out as 0, with one `VENN_INVALID_SIZE` warning naming them | D417 |
| A set of size 0, and the overlaps touching it, were dropped silently | Still dropped, with one `VENN_ZERO_SET` warning | D417 |
| A `text` or `style` naming an undeclared set or overlap was stored and silently not drawn | The same, with one `VENN_UNKNOWN_TARGET` warning | D417 |
| A repeated `set` or `union` was kept as a second subset | The same drawing (the last size wins, each copy takes a slot), with one `VENN_DUPLICATE` warning | D417 |
| A `venn` config value of the wrong type (`width: "wide"`, `padding: -4`) reached venn.js as it was | A number, or a numeric string, in the key's schema range; anything else lays out with the default, with no warning. A padding that leaves no room lays out at 0 | D417 |
| `venn.theme` (default `redux-color`) chose venn's theme when no other layer set one | The same: honoured with v12's default, and a `theme` from `initialize()` or the diagram text wins over it, as in v12 | P2 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320 |

## Venn SVG structure

What changed in the venn diagram's SVG compared with v12 (spec #429). v12's classes and draw
order are kept: `text.venn-title`, then a group translated by the title height holding each
`g.venn-area.venn-circle.venn-set-<n>` (with `data-venn-sets`), each
`g.venn-area.venn-intersection`, and `g.venn-text-nodes` > `g.venn-text-area` >
`text.venn-text-node`; each area holds its `path` and `text.label`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="venn"`, a `<style>` scoped by the id that sized the title (`32px`, over its `font-size` attribute) and the text nodes | No root `id`; `class="mermaid mermaid-venn"`, `role="img"`, `aria-roledescription="venn"` (kept), `data-mermaid-version`, and `<title id="<id>-title">` from the title, since venn has no `accTitle`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): fills, strokes, opacities and font sizes are presentation attributes, colours reading `var(--_x)` aliases on the root `style` | R-SEC-2, R-A11Y-1, D133, R-THEME-3 |
| Paint set inline with `style="fill: …; fill-opacity: …"` on each path and label | Presentation attributes (`fill`, `fill-opacity`, `stroke`, `stroke-width`, `stroke-opacity`, `font-size`) | R-SEC-2 |
| Text nodes: `foreignObject` > HTML `span` per cell | `text.venn-text-node` per node, inside its `g.venn-text-area`; no `foreignObject` | D414, R-SEC-2 |
| Two solves per render: the circles' (venn.js padding 15) and the text nodes' and hand-drawn circles' (`venn.padding`, 8), so `g.venn-text-nodes` and a sketch were placed on circles of another size | One solve: circles, labels, `g.venn-text-nodes` and the sketch share the drawn circles, at an author's `venn.padding`, else 15 | D412 |
| Title and labels placed by `dominant-baseline` (`middle`) and the title at `x="50%"` | Each placed by its measured box at the same centre, with `text-anchor="middle"` and no `dominant-baseline` | Core's label layout |
| No source mapping | `data-ast` on each drawn set's and overlap's `g.venn-area` and each `text.venn-text-node`; `data-id` (the area's sets joined with `_`, a text node's id, `title`) on those and on labels, which carry no `data-ast`; `data-venn-sets` kept | R-PARSE-8, pitfall 12 |
| An area venn.js marked disjoint was drawn off the canvas (a label at y −1000, a `M 0 0` path); an overlap with no label wrote an empty `text` | Neither is written | Nothing invisible is drawn |
| `style A stroke-width: 4px` reached the CSS as `4 px` (v12 joins value tokens with a blank), which the browser dropped, so the circle kept its default width | The number is read, so the circle is drawn 4 wide | v12's evident intent |
| The `viewBox` was always `0 0 width height` | v12's positions; the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) covers whatever is drawn, so a wide stroke or a long title can grow it | D224 |
| `look: neo` and the redux and neo themes: the same shapes as the classic themes | The same: venn differs between families by colour only | D227 |

### Venn theme colours

Each set `i` takes the `i mod n`th of the `venn1`…`venn8` slots that are set, else
`primaryColor`, as in v12, and an author's `venn<k>` wins in every theme. With a palette
(`borderColorArray`, which `redux-color` and `redux-dark-color` carry, or an author's in any
theme), an unset slot `k` takes the palette's entry `k − 1`, as those two themes filled theirs in
v12. `redux`, `redux-dark`, `neo` and `neo-dark` set no slot, so every circle is `primaryColor`,
as in v12. The title is `vennTitleTextColor` (v12's `titleColor || tertiaryTextColor`), overlap
labels and text nodes `vennSetTextColor`. What changed
(`packages/conformance/src/venn/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `base`, `forest` | `venn3` darkened `tertiaryColor` by 30 | By 40, as `default`: one classic light formula, so the third set is 10 % darker than in v12. Set `venn3` to draw v12's | D415 |
| `neutral` | The eight slots were its `cScale` greys (`#555`, `#F4F4F4`, …), which no override of a base colour moved | `default`'s formula on neutral's colours, so the slots follow an author's `primaryColor`, `secondaryColor` or `tertiaryColor`. Set `venn1`…`venn8` to draw v12's | D415 |
| `default` | `venn3` `#b5ff20`, from the unrounded `tertiaryColor` | `#b9ff20`, from the hex | D333(a) |
| Every theme | A set label was the circle colour lightened or darkened by 30 in the browser | The same colour, computed when the diagram is drawn: a host's `--mermaid-venn<k>` override, or the dark half of `theme: 'auto'`, does not move it | Labels are a literal colour |

Hand-drawn (`@mermaid-js/plugin-hand-drawn`): v12 sketched each circle at roughness 0.7 with a
hachure of the circle colour at 0.3 alpha, fill weight 2, gap 8 and angle −41 + 60 per set, and a
styled overlap cross-hatched in its fill at 0.7 alpha (fill weight 2, gap 6, angle 60, no
stroke). v13 sketches each circle and each
overlap a style fills as a `node` outline (roughness 0.7, hachure, fill weight 1.5, gap 1.5, the
hachure at the area's `fill-opacity`), and draws an unfilled overlap plain: the outline hook takes
no per-call options (D319, D302).

## Agentflow

- **Detection** is v12's: `agentflow-beta` (`/^\s*agentflow-beta\b/`, case-sensitive), fourth
  in detection order, after `architecture` and before `c4`. `agentflow` alone and
  `agentflow-betas` are not agentflow diagrams.
- **Syntax** is v12's (the grammar is in [syntax/agentflow.md](./syntax/agentflow.md)), and
  every error is reported, not only the first (R-PARSE-4). Three inputs read differently: the
  short input form `a[/x/]` is a parallelogram of kind `input` (D462), as v12 drew it after
  12.2.0 (12.2.0 drew a rounded box and warned `SHAPE_UNSUPPORTED`); a lone `%` in a label
  (`a[50% done]`) is label text (D463), where 12.2.0 rejected the diagram; `%%` is still a
  comment; and a comment before the header is skipped whatever it holds (D691), where 12.2.0
  rejected `%% direction LR` and `%%x@y` there.
- **Metadata** in `@{ … }` is read by v13's YAML reader instead of js-yaml, as flowchart's is:
  anchors, aliases and tags (`&`, `*`, `!`) are a syntax error, and a prototype key
  (`__proto__`, `constructor`, `prototype`) is dropped with one `YAML_UNSAFE_KEY` warning (v12
  dropped it silently). The trailing-comma retry (`shape: tool,`) is kept.
- **Layout** (D127): agentflow lays out with `layered`, core's engine, where v12 defaulted to
  ELK. Set `layout: elk` (or `agentflow.layout`) and register `@mermaid-js/layout-elk` to keep
  ELK; without the plugin `elk` draws with `layered` and warns `ELK_NOT_INSTALLED`. A flow's own
  `@{ algorithm: … }` is read but not applied, with one `ELK_ALGORITHM_IGNORED` warning (D174).
- **Geometry and the neo default** (D152, D153): v12 defaulted `agentflow.look` to `neo`, so
  every theme drew neo's gradient and shadow on agentflow. `look` is removed (ignored, one
  `LOOK_REMOVED` warning), and the geometry comes with the theme's family: under the default
  `redux-color` (agentflow's default theme in v12 too) nothing changes, and the classic themes
  (`default`, `dark`, `forest`, `neutral`, `base`) now draw classic geometry: no shadow, and no
  gradient in the four that drew one (`dark`, `forest`, `neutral`, `base`). Use a redux or `neo`
  theme to keep the neo look.
- **Diagnostics** (D461): v12's three diagnostics are reported at parse, with ranges and v12's
  messages: `SHAPE_REMOVED` and `SHAPE_UNSUPPORTED` at the bracket or `@{ … }` block, and
  `CONTAINMENT_VIOLATION` at the inner `flow` opener. `SHAPE_REMOVED` is a warning (v12 called
  it an error but still drew the diagram), so the diagram renders as it did. An unknown shape
  (`@{ shape: nope }`) is still an error, and `No such shape: tool,.` names the trailing comma.
  A `linkStyle` index out of range is a `LINK_STYLE_INDEX` error with v12's bounds message,
  where v12 threw a `TypeError`. The nine codes v12 reserved for a semantics module and never
  raised are not raised in v13 either: `EDGE_OPERATOR_UNSUPPORTED`,
  `REFERENCE_EDGE_LABEL_REJECTED`, `CONNECTOR_REF_UNRESOLVED`, `CONNECTOR_REF_NOT_A_CONNECTOR`,
  `METADATA_KEY_MISAPPLIED`, `DUPLICATE_ID_NODE`, `RESERVED_SYNTHETIC_ID`,
  `EDGE_SEMANTIC_CONTRADICTION` and `FLOW_NO_INPUT`.
- **Silent drops** (D464) are kept, each now with one warning per kind per render (positions of
  the other places in `related`): metadata written before its `flow` is lost
  (`AGENTFLOW_METADATA_DROPPED`), the reserved `connectors` id is left out with its edges
  (`AGENTFLOW_RESERVED_ID`), `view` on a node is ignored (`AGENTFLOW_VIEW_IGNORED`), and a
  `connector` declared after a node of the same id replaces it
  (`AGENTFLOW_CONNECTOR_REPLACED`). A `label` that is not text and an unknown `labelType` are
  read as v12 read them, with one `NODE_DATA_COERCED` warning each.
- **Tool-builder API** (D465): there is no DB object. v12's `getSemanticModel()`,
  `getDiagnostics()`, `getElementAtPosition()`, `getElementMappings()` and `getMappingStats()`
  are removed. `semanticModel(model)` from `@mermaid-js/diagram-agentflow` gives
  `getSemanticModel()`'s shape (skipped metadata keys included) from `parseAgentflow(text).model`;
  the parse's diagnostics carry ranges; positions and element spans come from the language
  service (`@mermaid-js/language-service`: symbols, `definition`, `astAt`, `rangeOf`, folding
  ranges), which loads the agentflow facet (`@mermaid-js/diagram-agentflow/language`).
- **Config** (the `agentflow` section): `theme` (a scoped theme wins over the top level, as in
  12.2.0), `titleTopMargin`, `diagramPadding`, `nodeSpacing`, `rankSpacing`, `wrappingWidth`,
  `minNodeWidth` and `useMaxWidth` are honoured, with v12's defaults. A length that is not a
  number from 0 up to 10,000 draws with its default and warns `AGENTFLOW_CONFIG_INVALID` once
  (v12 drew it as given). `useWidth` is ignored, as v12's renderer never read it. Agentflow
  still reads three `flowchart` keys (D466): `flowchart.padding` (node padding),
  `flowchart.inheritDir` (a flow without its own `direction` takes the diagram's) and
  `flowchart.subGraphTitleMargin` (room around a flow's title). With no curve set (no
  `agentflow.curve`, no `curve`, no `linkStyle default interpolate`), edges are drawn with the
  default curve, `rounded`: stepped routes with rounded corners, so nodes and labels can sit
  where they did not in v12, which drew `basis` S-curves there (v12's `flowchart.curve`
  default). Set `agentflow.curve: basis` to keep the S-curves (D687).
- **Edge curve** (D733, #1378): a per-edge `linkStyle <n> interpolate`, then `linkStyle default
  interpolate`, then the new `agentflow.curve`, then the new top-level `curve`, then `rounded`.
  v12 drew agentflow edges with `flowchart.curve`; v13 does not read it, so a diagram that set
  `flowchart.curve` for its agentflow edges sets `agentflow.curve` instead. With none of these
  set, the output is unchanged. Text output stays stepped and warns `ASCII_DROPPED` for a curve
  set by `agentflow.curve` or `curve`.
- **Limits**: the edge limit is v13's (`maxEdges`, 5,000 by default and set only by the
  integrator, R-SEC-5), with the message `Edge limit exceeded…`; v12 threw at 501 edges. A source
  longer than `maxTextSize` is rejected before it is parsed, as for every diagram.
- **Links and tooltips**: `click a "url" "tooltip"` draws an `<a href>` (only URLs that pass
  `securityLevel` and `linkSchemes`) and an SVG `<title>`, as flowchart does; `click a callback`
  needs `@mermaid-js/plugin-interactions` ([Click callbacks](#click-callbacks-and-bindfunctions)).
- **Hand-drawn**: with `@mermaid-js/plugin-hand-drawn`, vertices, flow frames, collapsed cards
  and edges are sketched, as in v12 ([Hand-drawn look](#hand-drawn-look)).
- **Labels** (#1368, #1396): markdown is read only in a markdown string (`` "`…`" ``), as in
  v12: `**x**`, `_x_`, a code span and a label wholly in backticks without quotes (`` `**x**` ``)
  are drawn as written, and a render whose plain labels hold an emphasis pair warns
  `MARKDOWN_NOT_READ` once. Two things differ from v12. A `\n` written as two characters inside
  a markdown string breaks the line, as `<br>` does and as it already did in every other
  agentflow label, where v12 drew it as text. A connector title written as a markdown string
  (`` connector c["`**x**`"] ``) is read as markdown, as every other label is, where v12 dropped
  the string's quotes and backticks and drew `**x**` as text. `markdownAlwaysOn: true` (or
  `agentflow.markdownAlwaysOn`) draws every label as markdown, quoted or not.
- **Shape-data labels** (#1368, #1432): v12 read a label written in shape data with no
  `labelType` (`a@{ label: "**x**" }`) as markdown. Now it follows the rule above: it is plain
  text unless the value is a markdown string (`` a@{ label: "`**x**`" } ``), read as markdown
  without its backticks. A written `labelType` is read as before.
- **Text output** is new (v12 had none, D320, D469): `format: 'ascii'` draws agentflow as text
  from the lazily loaded `@mermaid-js/diagram-agentflow/ascii` entry, in the `unicode` or
  `ascii` charset ([ASCII output](./ascii.md#agentflow-diagrams)). It is the same graph laid out
  in cells with `layered` (another `layout` draws as `layered`, with one `ASCII_DROPPED`
  `layout` warning). Each kind is flowchart's text form for its shape: a task (and a connector)
  a rounded box, a tool double sides, an input a slant (`/`), a decision a diamond (`◇`, `*`),
  a refdoc a folded corner (`╲`, `\`), an action a hexagon (`<`, `>`); a flow is a frame with
  its title on the top border, a collapsed flow a box marked `+`; `-->` ends in a head, `--x` in
  a cross (`✕`, `x`), and `-.-` is dotted. It is never cropped: wider than `ascii.maxWidth`
  it turns `LR` into `TB`, then warns `ASCII_TOO_WIDE`.
- **Text output drops**, one `ASCII_DROPPED` per kind: `style` (`style`, `classDef`, `class`,
  `linkStyle`, palette colours), `curve` (`interpolate`, `agentflow.curve`, `curve`), `emphasis`,
  `animation`, `link` (`click`, tooltips), `config` and `accessibility`. `config` names the
  options only the SVG reads, set off their default: `agentflow.useMaxWidth`,
  `diagramPadding`, `minNodeWidth` and `titleTopMargin`, and `flowchart.padding` and
  `flowchart.subGraphTitleMargin`. `nodeSpacing`, `rankSpacing` and `wrappingWidth` convert at
  8 × 16 px a cell, as flowchart's do (120 px wraps a label at 15 columns).

## Agentflow SVG structure

What changed in the agentflow's SVG compared with v12 (spec #523, #548). v12's classes are kept
so selectors that use them keep working: `clusters`, `cluster`, `flow-cluster`, `cluster-label`,
`edgePaths`, `flowchart-link`, `edge-thickness-normal`, `edge-pattern-solid`/`-dotted`,
`edgeLabels`, `edgeLabel`, `nodes`, `node`, `default`, `af-kind-<kind>`, `flow-collapsed`,
`collapsed-separator`, `collapsed-indicator`, `agentflowTitleText` and user `classDef` classes.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id, `aria-roledescription="agentflow"` | No root `id`; `class="mermaid mermaid-agentflow"`, `role="img"`, `aria-roledescription="agentflow"`, `data-mermaid-version`; colours are presentation attributes reading `var(--_x)` aliases declared on the root `style` (only `theme: 'auto'` writes a custom-property sheet) | Inert output (R-SEC-2); hosts re-theme with `--mermaid-*` (R-THEME-3) |
| `<g class="root">`, `<defs>` with `<marker>`s (point, circle, cross, hierarchy), `marker-end="url(#…)"` | The four groups are the root's children; each arrowhead is a `<path class="marker">` right after its edge's path: a filled triangle for `-->`, two stroked diagonals for `--x`, none for `-.-` | No `<defs>` or ids (D35); the head takes the edge's colour |
| Element ids: vertices `<render id>-flowchart-<id>-<n>`, edges `<render id>-L_<a>_<b>_<n>`, flows by their id | `data-id` (the vertex, flow or edge id) and `data-ast` (its AST id: `n:<id>`, `s:<id>`, `e:<a>><b>`) on each `g.node`, flow `g.cluster` and edge `path`; labels carry `data-id` only | Ids are global in a page; `data-ast` maps an element back to its source (R-PARSE-8, D468) |
| Edge: `<path class="… flowchart-link" id>` inside `g.edges.edgePath` | `<path class="flowchart-link edge-thickness-normal edge-pattern-solid\|dotted[ edge-animation-*][ classes]" data-id data-ast>` directly in `g.edgePaths`, or, for an animated edge, in a plain `<g>` there with its arrowheads; a dotted edge is `stroke-dasharray="2"` with butt caps. Its ends are on the outline of the shape drawn (the layout puts them there), and its curve follows `linkStyle … interpolate`, the default's, `agentflow.curve` or `curve`, else `rounded` (D687, D733) | One element per edge maps it to its source |
| Animated edges (`animate`, `animation`): `stroke-dasharray: 9,5` and the `dash` keyframes | The same dashes, caps and speeds, moved by an `<animate>` in the edge's `<g>`: the keyframes need a `<style>` | R-SEC-2, D606, as the flowchart (#1196) |
| Edge label: `<g class="edgeLabel">` with HTML on `edgeLabelBackground`, no border | `<g class="edgeLabel" data-id>` with a tag: a `<rect rx="6">` with 8 px of room each side of the text and 4 px above and below, filled opaque with `edgeLabelBackground` (the theme background unless set), bordered 1 px solid in the edge's stroke (a `linkStyle` or class stroke, else `lineColor`) (still 1 px and solid on dotted edges), then a `<text>`; one box around a label of several lines, none for an empty one | Edge labels are tags (D626–D629) |
| Labels: `<foreignObject>` with HTML (`span.nodeLabel`, `div.labelBkg`) | `<text>`/`<tspan>` from core's label layout (markdown strings as markdown, math with the math plugin, D176); a word wider than `wrappingWidth` (`translate_to_swedish`) stays whole and the node grows to hold it, as the HTML did (the text output splits it) | No HTML mode (D5); labels measure deterministically (R-TEXT-4); #649 |
| Vertex: `<g class="node default af-kind-<kind>" id data-look>` with `rect`/`polygon`/`g.outer-path` classed `basic label-container` and a `g.label` | `<g class="node default af-kind-<kind>[ classes]" data-id data-ast transform>` with the shape (`rect`, `polygon` or `path`), its inner lines (the tool's two rails, the refdoc's rule) as one `path`, then one `<text>`; no `label-container`, `label` or `data-look` | Fewer elements; shapes are plain outlines (D446: a local copy of flowchart's) |
| Flow: `<g class="cluster flow-cluster" id data-look data-color-id>` with `<rect rx="10" stroke="<flowContainerStroke>">` (the stylesheet overrode the stroke) and a `g.cluster-label` around a `<foreignObject>` | `<g class="cluster flow-cluster[ classes]" data-id data-ast[ data-color-id]>` with `<rect rx="10" fill="none" stroke-width="0.75">` and `<text class="cluster-label">` (`titleColor`), `flowchart.subGraphTitleMargin.top` below the frame's top | Text labels; the stroke is what v12 drew (below) |
| Collapsed flow: `<g class="node" id data-color-id>` with `<rect class="basic label-container flow-collapsed">`, a `line.collapsed-separator` and three `circle.collapsed-indicator` | `<g class="node[ classes]" data-id data-ast="s:<id>"[ data-color-id]>` with `<rect class="flow-collapsed" rx="10">`, `<line class="collapsed-separator">` (0.75 px, dashed `3, 3`, `flowContainerStroke`), three `<circle class="collapsed-indicator">` (r 2.5, `nodeBorder`, opacity 0.5) and the title's `<text>` | It is drawn as a node with its flow's AST id; the paints are v12.2.0's computed ones |
| Paints from the `<style>`: neo's `[data-look="neo"]` rules stroke vertices, cards and frames with `nodeBorder` (the gradient in themes that have one) and add the shadow; `.flow-cluster rect` leaves frames unfilled at 0.75 px | The same, as attributes: vertices and cards `mainBkg` / `nodeBorder` (`theme.outline`, the gradient where `useGradient` is on, D182) at `strokeWidth`, frames `nodeBorder` unfilled at 0.75 px, all with `dropShadow` where the theme has one; the refdoc's rule is plain `nodeBorder` under the gradient (D185) | D152, D182, D227 |
| `agentflow.look` defaulted to `neo`, so every theme drew neo's gradient and shadow on agentflow, the classic five included | `look` is ignored (`LOOK_REMOVED`, D153); each theme draws as its family does: the classic themes (`default`, `dark`, `forest`, `neutral`, `base`) without the shadow, and `dark`, `forest`, `neutral` and `base` without the gradient | D152, D153, D227 |
| Per-item colour: stylesheet rules under the theme names `redux-color` / `redux-dark-color` only, keyed on `[data-look].node.af-kind-<kind>` and `[data-color-id].cluster` | Attributes, on whenever the theme (or the author) carries a non-empty `borderColorArray`, never by theme name: each kind its fixed slot (tool 0, task 1, decision 2, input 3, refdoc 4, connector 5, action 6), each flow `7 + n mod (length − 7)` in declaration order, a collapsed flow its flow's; fill from `bkgColorArray` only when it is not empty; `data-color-id="color-<slot>"` on frames and cards. An author `style`/`classDef` still wins | D152, R-THEME-11 |
| `themeVariables.flowContainerStroke` (every theme: `… \|\| secondaryBorderColor`), drawn only on the card's separator | `flowContainerStroke`, agentflow's own theme variable (`--mermaid-flowContainerStroke`), rule `secondaryBorderColor`; v13 derives `secondaryBorderColor` with core's rule, so the separator's grey differs slightly from v12's in the themes that derive it | D331 |
| Title: `insertTitle` appended `<text class="agentflowTitleText">` (18 px, `textColor`) at `y = -titleTopMargin`, centred on the drawing; `setupViewPortForSVG` fitted the `viewBox` around everything | `<text class="agentflowTitleText" font-size="18">` (`textColor`), its baseline `agentflow.titleTopMargin` above the layout's box, centred on it; the `viewBox` starts at a negative `y` (and `x`, for a title wider than the drawing) to hold it with `diagramPadding`. Without a title the `viewBox` is `0 0 w h` | D218, D224 |
| `click A "url"` wrapped the node in `<a xlink:href>`; tooltips were an HTML hover div; `click … callback` bound through the DB | `<a href>` inside the node group (only URLs that pass `securityLevel` and `linkSchemes`; a refused one warns `URL_REFUSED`); a tooltip is an SVG `<title>` in the node group; `click … callback` draws nothing and is bound by `@mermaid-js/plugin-interactions` | No script in output (R-SVG-4, R-SVG-5, D105) |
| `look: handDrawn` sketched vertices, frames and the card's frame with roughjs; a sketched frame or card is a `<path>`, which the stylesheet's `.flow-cluster rect` and neo `.cluster rect` rules missed, so both kept the `flowContainerStroke` attribute, unfilled and without the shadow (only a palette slot recoloured a frame) | With `@mermaid-js/plugin-hand-drawn`, every outline goes through `w.outline`: shapes and the card (`node`), frames (`group`), the rails, the rule and the separator (`divider`), the dots (`mark`) and edges (`edge`). A sketched frame and card keep the paint they have without the plugin (`nodeBorder` or their slot, the card filled, the shadow where the theme has one): the renderer never branches on the plugin, and a drawer gets only the role and the paint | D152, D301, D302 |

## Architecture diagram

What changes in how an architecture diagram is drawn, against v12 12.2.0
(`architectureRenderer.ts`, `svgDraw.ts`, `architectureIcons.ts`, `architectureStyles.ts`), and
why (spec #525). The layout itself is `compass` (D326).

| v12 | v13 | Why |
| --- | --- | --- |
| `layout` never reached architecture: whatever it said (`dagre` by default, or set site-wide with `initialize`), the diagram was laid out by its own cytoscape + fcose layout from the sides each edge names | `compass` by default (D326). `layout` names the engine, from any config layer (`initialize`, front matter, directives, `architecture.layout`), so a site-wide `layout: 'dagre'` now reaches architecture: `layered` and `dagre` rank services down the flow, and an edge's sides only set where its line attaches, so `a:R --> L:b` puts `b` under `a`. Each line is drawn at right angles, apart from the lines drawn before it, and the lines on one side of a node attach apart (D718). They also ignore `{group}` edge ends and `align`. One `ARCHITECTURE_PLACEMENT_IGNORED` warning names what the diagram uses that they ignore. Set `architecture.layout: compass` to keep v12's placement from the sides under a site-wide `dagre`. `compass` and an installed `elk.*` (its ports on the named sides) warn nothing | D560, D327, D718 |
| The seven built-in icons (`database`, `server`, `disk`, `internet`, `cloud`, `blank`, `unknown`) were an icon pack, `mermaid-architecture`, registered globally when the diagram loaded | The package draws them itself, in v12's look (80 × 80 `#087ebf` squares with white strokes, scaled to `architecture.iconSize`), the same in every theme, with no extension | D505, D152 |
| An icon name that resolved nowhere drew a blue square with a white `?` and logged an error | The same `?` square, and one `ICON_NOT_RENDERED` warning per render naming each such icon once | D505, D291 |
| Any other icon came from a pack registered with `registerIconPacks`, its name split by Iconify's `stringToIcon` with `mermaid-architecture` as the fallback pack: `logos:aws` and `logos-aws` are both the `logos` pack's `aws`, `a:b:c` is `b:c` | The same names from the same packs, through the icons extension (`@mermaid-js/plugin-icons`), which splits them as v12 did; the diagram lists each with that fallback pack (`icons()`) so the extension loads it. Without the extension or the pack: the `?` square and `ICON_NOT_RENDERED`. Gradients and other parts an icon body may not hold are simplified, with `ICON_SIMPLIFIED`. While the pack is still loading the icon's square is left empty | D505, D293, D295, D299 |
| A text icon (`service a "text"`) was an HTML `<div>` in a `foreignObject`, left-aligned, cut to `(iconSize − 2) / fontSize` lines by `-webkit-line-clamp` | SVG text from core's label layout, in white, centred in the `blank` square, wrapped to the square less v12's 1 px margin, cut to the lines that fit, the last ending in `…` where text was cut | D506, R-SEC-2 |
| Every edge was a straight line or one bend through cytoscape's midpoint | The same wherever the route has at most one bend. A route that needs more (two ends on one side, an edge from a node to itself, a detour round another node) is `compass`'s orthogonal route, with square corners. A route with at most one bend that would run along another edge, or through a service or junction it does not end on, is moved apart: a straight one is offset along the sides it meets (a group edge beside junction lines runs between the borders), one bend goes round | D507, D721 |
| Edge labels: along a level line under its midpoint, wrapped to its length; turned −90° beside a vertical line, wrapped to two thirds of it; turned ±45° inside a bend, wrapped to half its width | The same placement. On a route with more than one bend the label is flat, unwrapped, where `compass` left room for it | D507 |
| `architecture.fontSize` sized cytoscape's own label style and moved a group's title by half of it | `ignored`: every label is drawn in the theme's `fontSize` (as v12 drew the text), and the group title sits in the title band `compass` placed | D507 |
| The `architecture` settings `randomize`, `nodeSeparation`, `idealEdgeLengthMultiplier`, `edgeElasticity`, `numIter` and `seed` tuned cytoscape's fcose solver, which placed nodes from random starting points (made repeatable by `seed`) | All six are `ignored`, with no warning: `compass` places nodes on a grid from the sides each edge names, the same layout on every render, with nothing to tune | D328, D326 |
| `architecture.useWidth` was in the schema but never read | `ignored`, with no warning; `useMaxWidth` is honoured as before | v12 never read it |
| `look: handDrawn` (top level or `architecture.look`): v12 never sketched an architecture diagram | Without `@mermaid-js/plugin-hand-drawn`, `look` is ignored with one `LOOK_REMOVED` warning, as in every section. With the plugin, `look: handDrawn` turns `handDrawn` on with no warning, and the diagram draws exactly as without it: not sketched | D301, D303 |
| `architecture.padding` and `iconSize` took any value | A number, or a numeric string, from 0 to under 10,000; anything else draws with the default (40, 80) and one `ARCHITECTURE_CONFIG_IGNORED` per key. The gap between grid cells stays 60 px whatever they are | Pitfall 22 |
| A service's label hung from the icon's bottom, its first line's middle 1em below it | The label's box starts at the icon's bottom, as `compass` sized the service (the icon with its label under it), a few px higher | D501 |
| An arrowhead longer than its end of the line ran past the line's corner, and two heads on a short line (`<-->`) were drawn over each other (a large `iconSize`: the heads are `iconSize / 6`) | A head shrinks until its base stays on its own end segment (with two heads on one segment, until the bases meet), with one `ARCHITECTURE_ARROW_SHRUNK` warning. Never at the default sizes | GAPS #525 T3, T4 |
| Edges were always drawn from the sides as written | They meet their nodes where the layout engine says (its ports): the same sides under `compass`; under `layout: elk` or another engine that ignores them, the heads and labels follow the line it drew. An edge the engine routes no line for keeps its `path.edge`, with no line, and one `ARCHITECTURE_EDGE_NOT_DRAWN` | D507, D508 |
| `base` drew edges and arrowheads `#777` and group borders `#000`, literals no other theme had, which no override moved | `base` takes the rule every other theme follows: edges in `lineColor`, borders in v12's group border (below). So in `base` an author's `lineColor` or `background` moves the edges, and `primaryColor` or `darkMode` the group borders | D541 |
| Group borders (`archGroupBorderColor`) took the theme's `primaryBorderColor` as each theme's constructor first set it, before the theme recomputed it, so an author's `primaryColor` or `primaryBorderColor` never reached them | The same colour in every theme but `base` (the D332 input `calloutBorder`), and an author's `primaryBorderColor` now recolours them | D541, D332 |
| `createText` read Markdown in every service, group and edge label: `**x**` drew bold and `*x*` italic without backticks, and a label wholly in backticks was not told apart from any other | The label rule of every type. A markdown string, a label wholly in backticks with or without quotes (`` "`**bold** *italic*`" ``), is drawn as Markdown without its backticks, in a service, group or edge label and in a text icon. Any other label is plain: `<br>` breaks the line, `<b>`/`<strong>`, `<i>`/`<em>`, `<u>`/`<ins>`, `<s>`/`<strike>`/`<del>`, `<sub>` and `<sup>` draw their formatting without the tags, and character references are decoded, but `**x**`, `*x*`, `_x_` and a leading `- ` or `# ` stay as written. To keep v12's bold or italic, wrap the label in backticks or use `<b>`/`<i>` | D710 |
| v12 drew no line hops in architecture diagrams | `lineHops: true` (or `'arc'`, `'gap'`): where two edges cross, the straight run that gives way draws a 6px hop (`gap`: a break), through core's shared edge-path step. The edges stay plain under `look: handDrawn`. The shared key defaults to `false` (D689), so crossings hop only where a document turns hops on | D537, #655 |

## Architecture SVG structure

What changed in the architecture diagram's SVG compared with v12 12.2.0, and why (DESIGN §7.2,
spec #525). v12's sections, their order and its class names are kept: `g.architecture-edges`
(per edge a `g` with `path.edge`, `polygon.arrow` heads and its label), then
`g.architecture-services` (each `g.architecture-service`, then each `g.architecture-junction`),
then `g.architecture-groups` with each group's `rect.node-bkg`; labels in
`architecture-service-label`, a service with no icon `path.node-bkg`, text icons `node-icon-text`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="architecture"`, a `<style>` with `.edge`, `.arrow`, `.node-bkg` and `.node-icon-text` rules | No root `id`; `class="mermaid mermaid-architecture"`, `role="img"`, `aria-roledescription="architecture"` (kept), `data-mermaid-version`, `<title id="<id>-title">` / `<desc id="<id>-desc">` from `accTitle` / `accDescr`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): strokes, fills, widths and the dash are presentation attributes reading `var(--_x)` aliases of the five `arch*` variables | R-SEC-2, R-A11Y-1, D133 |
| Element ids `<id>-service-<name>`, `<id>-group-<name>`, `<id>-node-<name>` (a junction's box, a service's outline) and `<id>-L_<a>_<b>_0` on edges, which parallel edges shared | No element ids. `data-id` and `data-ast` carry the AST ids (`service:<id>`, `junction:<id>`, `group:<id>`, `edge:<a>-><b>`, `@2` on a repeat) on each service's, junction's and group's `g` and each edge's `path.edge`; labels and arrowheads carry `data-id` only | D508, R-PARSE-8 |
| A service's `g` was translated to cytoscape's node centre and drawn from there, so the icon sat half an icon right of and below its node, and groups and edges were offset to match | The service's `g` is translated to its icon's corner; everything is placed by `compass` in one frame | D326 |
| A service held its label `g` (`createText`: a `g > g` with `dy`, `alignment-baseline` and `dominant-baseline` attributes, an empty `rect.background`, `text > tspan.text-outer-tspan > tspan.text-inner-tspan`) and then its icon as `g > g > svg` | The label is `g.architecture-service-label > text`, a `tspan` per line from core's label layout with absolute positions; the icon follows as one `g` holding v12's elements (each `style` written as presentation attributes, the `id`s `b` … `e` dropped, a `scale()` when `iconSize` is not 80), with no nested `<svg>`. A pack icon is the extension's glyph in a `g` | R-SEC-2, D505 |
| A text icon's square, then a `foreignObject > div.node-icon-text > div` | The `blank` square, then `text.node-icon-text` | D506 |
| A junction was `g.architecture-junction > g > rect` with `fill-opacity="0"` | `g.architecture-junction > rect fill-opacity="0"`, translated to its corner | One element less |
| Each group was a `rect.node-bkg` and a separate `g` (its icon `g`, its label `g`) directly in `g.architecture-groups` | Each group is one `g.architecture-group` (a new class) holding its `rect.node-bkg`, its icon and its start-anchored `g.architecture-service-label`, so `data-ast` has one element per group | D508, R-PARSE-8 |
| `path.edge` was `M start L mid L end` through cytoscape's midpoint; a head was `polygon.arrow` with `points` from the origin and a `transform` | `path.edge` holds the route's corners only (a straight edge has no middle point); `polygon.arrow` has absolute `points`, v12's triangle `iconSize / 6` across with its tip 2 px into the node, as before | Plain geometry |
| An edge label was a `g` with `translate()` (and `rotate()`, or a `translate()`/`translate()`/`rotate()` list on a bend) holding `createText`'s output | `g.architecture-service-label` with `rotate(angle, x, y)` when turned, holding a `text` at absolute coordinates | R-SEC-2 |
| The viewBox was the drawing's `getBBox()` plus `architecture.padding` | The layout's box (with `padding` round it), grown to hold any edge label or arrowhead past it | No DOM measuring |

## Block diagram

- **Syntax** is v12's (the grammar is in [syntax/block.md](./syntax/block.md)): line breaks
  separate nothing, ids take `;`, `,`, `.`, `|`, `%`, `#` and Unicode, labels are quoted, and
  every error is reported, not only the first, with messages in words (R-PARSE-4). What v12
  rejected is still rejected, except `style` (below).
- **Edge chains** (D442): `a --> b --> c` declares `a`, `b` and `c` and draws both edges. v12
  dropped `a`, `b` and the first edge and drew a block `undefined`.
- **`class` before its block** (D442) gives the block the class, and the block is drawn. v12
  made a hidden block of the id, so the later declaration was never placed.
- **`class a, b`** (D442) gives `b` the class too: the ids are trimmed. v12 looked up ` b` and
  drew `b` without the class.
- **`root`** (D442) is an ordinary block id. v12 merged it into its own top level and drew
  nothing for it.
- **A leaf later opened as `block:a … end`** (D442) keeps its place and holds the children.
  v12 lost the children.
- **A composite opened a second time** keeps both bodies: the second adds to the first. v12 lost
  the second body's new blocks. Pending a D-id (D440).
- **A chain in a composite header**, `block:a --> b … end`: the composite is `a`, and the edge
  and `b` stand next to it. v12 drew a composite with no id and lost the edge. Pending a D-id
  (D440).
- **`style`** (D443) applies after every statement, so `style a …` before `a` and
  `style a,b …` work; ids that never appear get one `BLOCK_STYLE_UNKNOWN` warning. v12 threw a
  TypeError and rejected the diagram.
- **Degenerate sizes** (D445). `columns 0` lays out as `columns auto` and a span `:0` as `:1`,
  with one `BLOCK_SIZE_INVALID` warning (v12 threw or drew NaN). Spans are capped at 1,000
  columns and `space:n` at 100,000 cells, with one `BLOCK_TRUNCATED` warning; v12 kept larger
  ones, and rejected a spacer over 16,777,214 cells (`Map maximum size exceeded`), which v13
  now accepts. Block-arrow directions are trimmed, so `( right , left )` draws (v12 drew no
  arrow).
- **Generated ids** of spaces and anonymous composites are `id-1`, `id-2`, … in source order,
  where v12 drew random ones (R-ARCH-6).
- **Self-loops and parallel edges** (D441): edges stay v12's straight segments between the
  centres, clipped at the outlines, and parallel edges still overlap; a self-loop (`a --> a`),
  which v12 drew with zero length, is an arc standing out at the block's top right.
- **Composite labels** (D444): `block:g["Title"] … end` reserves a band above the composite's
  grid for its label, so the label no longer sits under the children; an unlabelled composite
  is laid out as in v12.
- **Config** (the `block` section): `padding` (default 8: the grid gap and inset, and a leaf's
  label padding) and `useMaxWidth` are honoured. A `padding` that is not a finite number of 0 or
  more (`-3`, `"x"`, `"20"`) lays out at 8, and one over 1,000 at 1,000, each with one
  `BLOCK_CONFIG_INVALID` warning (D226, D445); v12 laid it out as it was (a string was
  concatenated into the sizes, `1e9` drew a viewBox about 1e9 wide). A block-scoped `theme`
  wins over the top level, as in 12.2.0. `useWidth` and `layout` are ignored, as v12's block
  renderer never read them (block lays out its own grid). `look` is removed (D153): ignored with one
  `LOOK_REMOVED` warning; the redux and `neo` families carry the gradient, shadow and neo
  paddings.
- **Line hops** (new, D537, #655): with `lineHops: true` (or `'arc'`, `'gap'`), where two
  straight edges cross, the later one draws a 6px hop (`gap`: a break), through core's shared
  edge-path step. A self-loop's curve neither hops nor is hopped over. Edges stay plain under
  `look: handDrawn` (D447). The shared key defaults to `false` (D689), so crossings hop only
  where a document turns hops on.
- **Text output** (new, D449): `format: 'ascii'` draws block diagrams as text from the lazily
  loaded `@mermaid-js/diagram-block/ascii` entry: boxes on a character grid, composites as
  frames, edges as stepped lines. `block.padding` is ignored there, with no warning. See
  [ASCII output](../ascii.md#block-diagrams).

## Block SVG structure

What changed in the block diagram's SVG compared with v12 (spec #521). v12's classes are kept,
and its block order: `g.block` holds every block in pre-order (a composite before its children),
each a `g.node` (`node <classes or default> flowchart-label`) holding its shape as
`label-container` (a composite's is `rect.basic.cluster.composite.label-container`) and its
`g.label`; then the edges as `path.flowchart-link` with `edge-thickness-*` and
`edge-pattern-*`; then the edge labels as `g.edgeLabel` (a change of order, below).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, a `<style>` scoped by the id (shape, edge, label and palette rules) | No root `id`; `class="mermaid mermaid-block"`, `role="img"`, `aria-roledescription="block"` (kept), `data-mermaid-version`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): fills, strokes and widths are presentation attributes reading `var(--_x)` aliases on the root `style` | R-SEC-2, R-THEME-3 |
| `<defs>` with `<marker>`s (point, circle, cross) referenced by `marker-start`/`marker-end`, and for `look: neo` a gradient and a drop-shadow `<filter>` | Arrowheads drawn inline after their edge (`path.marker`, `circle.marker`); the drop shadow is the theme's `dropShadow` as a `filter` attribute; the gradient is core's one scoped `<linearGradient>` (`<id>-gradient`), on outlines only | DESIGN §7.1, D182 |
| Ids on every block (`<render id>-<id>`) and edge (`<render id>-<k>-<a>-<b>`) | No ids: `data-id` (the block's id, the edge's `<k>-<a>-<b>`) on each `g.node`, edge `path`, `g.label` and `g.edgeLabel`; `data-ast` on each `g.node` and edge `path` only | R-ARCH-6, R-PARSE-8, pitfall 12 |
| Labels: `g.label` > `foreignObject` > HTML `span` | `g.label` > `text`/`tspan` from core's label layout; markdown strings stay rejected (syntax) | R-SEC-2 |
| Every block wrote a `g.label`, an unlabelled composite's empty (`labelHelper`) | An unlabelled composite has no `g.label` | Nothing invisible is drawn |
| A composite's label at its centre | In its band above the grid (`padding`, then the label) | D444 |
| A block arrow's polygon `label-container`, as a leaf polygon's | `label-container block-arrow`, so a hand-drawn drawer and a stylesheet can tell the two apart | D447 |
| Edge classes `… flowchart-link LS-a1 LE-b1` (fixed, meaningless `LS`/`LE`) | `edge-thickness-* edge-pattern-* flowchart-link` | Dead classes dropped |
| Edges from centre to centre, clipped at the outline v12's intersect found (the crossing nearest the far end) | Clipped at the outermost crossing of each outline; a self-loop is a cubic standing out at the top right | D441 |
| Edge label `g.edgeLabel` > `g.label` > `foreignObject`, a background at `edgeLabelBackground` | `g.edgeLabel` > its background `rect` (`edgeLabelBackground`) and its `text` | R-SEC-2 |
| Edge label on a half-transparent `edgeLabelBackground` fill with square corners and no border, the edge's room not counting it | A tag, the shared edge label: a rounded box (`rx` 6) with 8 px of room each side and 4 px above and below, filled opaque with `edgeLabelBackground` (the theme background unless set) and bordered 1 px solid in the line colour, also on thick and dotted edges. The label's room in the layout is the same box (`labelPatch`), so diagrams with labels grow a little. Under `look: handDrawn` the border is sketched. The fill is `blockEdgeLabelBackground` (default `edgeLabelBackground`) and the ink `blockEdgeLabelColor` (default `textColor` where it reads on the fill, else black or white); v12 inked the label with the node text colour, so the ink differs in `redux-dark`, `redux-dark-color` and `neo-dark` (`#cccccc`, was `#e0dfdf`), and an author's `nodeTextColor` no longer colours edge labels (set `blockEdgeLabelColor`) | D626, D627, D628, D629, D630, D713, D715 |
| Each edge label drawn straight after its edge (`insertEdges`), so a later edge could cross it | Every edge first, then every edge label, so no edge crosses a label | As flowchart v13 (one family, user story 6) |
| Arrowheads painted `lineColor` (block's `.marker` rule) | Painted `arrowheadColor`, as flowchart v13, which follows `lineColor` in every built-in theme, so the heads have the line's colour, as in v12 | One family with flowchart (D680) |
| Composite palette in CSS (`[data-look][data-color-id="color-i"].node rect.composite`), only in `redux-color` and `redux-dark-color` | `data-color-id="color-<n>"` on the composite's `g.node` (kept) with the slot's stroke and fill on its `rect`, wherever the theme or the author sets `borderColorArray`; `style`/`classDef` still beat it | D152, `paletteSlots()` |
| Without the palette, block's `.node .cluster` rule filled a composite `fade(clusterBkg, 0.5)` and stroked it `fade(clusterBorder, 0.2)` (rgba colours in CSS) | In the classic themes (`blockCompositeClusterPaint`), the composite's `rect` has `fill` `clusterBkg` with `fill-opacity="0.5"` and `stroke` `clusterBorder` with `stroke-opacity="0.2"`; a `style`/`classDef` fill or stroke is opaque, as v12's inline style was. The label keeps `nodeTextColor`, as v12's (its `g.label` is outside the `.cluster` rect) | D573, R-THEME-3 |
| `data-look` on nodes; `look: neo` drew the gradient and shadow | No `data-look`: `look` is ignored (`LOOK_REMOVED`); the redux and `neo` families carry the gradient and shadow, on leaves, block arrows and composites, never on edges or labels | D153, D181, D227 |
| Edge line ends: the SVG default butt caps | Round caps on solid edges, butt on dotted ones (round caps would close a 2 px dash's gaps); widths as v12 (`strokeWidth`, thick 3.5, dotted dashed `2`) | As flowchart v13 |
| `classDef` text styles applied by CSS (`color` rewritten to `fill`) | A class's or `style`'s `color` is the label's `fill`; a styled `fill` gives the label the matching ink | As flowchart v13 |
| A double circle grew with its cell (both rings stretched to the cell's width) | Drawn at its natural size, centred in its cell, as the circle and the diamond are | Spec #521 (GAPS T3) |
| Composites nested 5 or more levels deep sized as v12's repeated sizing compounded (a block at depth d sized 2^d times) | Each composite is sized at most 16 times, so the layout stays linear: v12's sizes exactly to 4 levels; at 5 levels 97 of 300 generated trees differ (median 544 px, at most 27,405 px), at 6 levels 32 of 100 (median 2,496 px, at most 53,192 px) | Linear layout; past the cap pending a D-id (D440) |
| The `viewBox` from the browser's `getBBox()` plus 5, and a height one "magic factor" taller | The layout's bounds (every outline, label and edge, plus v12's 5 px) | D224 |
| No text output | `format: 'ascii'` (both charsets): boxes on a character grid, one width per column at the widest label, composites as frames with the label on the top border, spaces blank, labels cut with `…`, block arrows as boxes with an arrowhead per pointing side, edges as stepped lines with arrowheads; `block.padding` ignored with no warning | D449, D320 |
| Hand-drawn: leaves sketched by roughjs | Leaves through the outline hook (`node`, and `divider` for the subroutine's frames, the cylinder's rim and the double circle's inner ring); composites, block arrows and edges plain, as v12; an edge label's border sketched (`label`) | D301, D302, D447, D630 |

## C4 diagram

The C4 parser accepts the v12 language (`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`,
`C4Deployment`; oracle parity over the corpus, grammar in [syntax/c4.md](./syntax/c4.md)). The
layout is a port of Pele's C4 grid and relation router, sized with v12's `c4` lengths (D454,
D455). What changes (spec #522):

| v12 | v13 | Why |
| --- | --- | --- |
| The detector matched `C4Context` where the diagram starts but `C4Container`, `C4Component`, `C4Dynamic` and `C4Deployment` anywhere in the text, so a flowchart or sequence diagram that named one was taken for C4 and failed | All five headers only where the diagram starts, as a whole word (`/^\s*C4(Context\|Container\|Component\|Dynamic\|Deployment)\b/`), still fifth in v12's detector order | D451 |
| An unquoted argument ran on past `)` and across the line end; a trailing `%%` comment took its line break, joining the next statement to it; a lone `title` took the next line as the title | An unquoted argument stops at `)` and at the line end; a comment keeps its line break; a lone `title` is an empty title | D452 |
| A person was a 13 px head in a 26 px row over a box as tall as its text, so a one-line person was a small head on a flat box | A head over a body in c4model.com's proportions: head radius 0.23 × the width (16 to 80), the body at least 0.6 × the width tall, the text centred below the head. The text output (`format: 'ascii'`) still draws a person as a box with a head row | #683, as v12's fix mermaid-js/mermaid#8322 |
| The top-level `wrap: false` did not stop element text from wrapping (only `c4.wrap: false` did), so an element stayed 216 px wide | The top-level `wrap`, when set, wins over `c4.wrap` for every text: `false` keeps element text on one line, `true` wraps it and relation labels and boundary headers too | #683, as v12's fix mermaid-js/mermaid#8342 |
| A `#` in a `title` or `accDescription` (`title Order #42`) was a syntax error: the text stopped at the `#` | A `#` is text; `;` and the line end still end the line's text | #683, as v12's fix mermaid-js/mermaid#8039 |
| Two relations between the same pair were one: the last label and kind won, an earlier technology stayed (`Rel(a, b, "Pushes", "AMQP")` then `BiRel(a, b, "Reconciles")` drew `Reconciles [AMQP]`), and a `C4Dynamic` step disappeared and the rest were renumbered. `UpdateRelStyle` styled that one relation | Every relation statement is drawn, with its own label, technology and kind; `C4Dynamic` numbers every step; lines between the same two shapes are spread apart; `UpdateRelStyle(a, b, …)` styles every relation from `a` to `b` written before it. A repeated alias still merges | D584, for the maintainer (as v12's fix mermaid-js/mermaid#8143) |
| A quote left open ran on to the next quote, taking the statements in between (`Person(a, "A)` then `Person(b, "B")` made one person); a tab before an opening quote left the quotes in the text; `"A \"q\" B"` split in two with no sign of it | An unclosed quoted text, or named value, stops at the line break before a line that starts a statement (a macro name and its `(`) with an `UNCLOSED_STRING` error at the opening quote, and the statements after it parse; a tab before an opening quote is a blank; a `"` inside an unquoted argument gives a `C4_QUOTE_IN_ARGUMENT` warning naming the line (there is no escape for a quote: write `'` or `#quot;`). A quoted text over several lines that closes is unchanged | #681 |
| A `$__proto__` argument crashed the parse | It sets nothing, with one `C4_NAME_RESERVED` warning | D452 |
| A `direction TB` line crashed the parse, and so did a label holding the words (`Person(a, "the direction LR is")`) | `direction TB`, `BT`, `LR` or `RL` on a line of its own sets the order the grid fills, at the top level or in a boundary's braces: a line of members is a row in TB (the default, drawn as before) and BT, a column in LR and RL, and BT and RL put the first statement last. A boundary without one takes its parent's, and the last statement wins. A label that holds the words is a label. A `direction` with another value, or with text after it, is a syntax error | D452, D591 |
| A `$name="value"` in the alias, label or relation-end slot was stored there as written (`Person($label="x", u)` aliased `$label="x"`) | It sets the field it names and leaves the slot empty, with one `C4_NAMED_ARGUMENT_MOVED` warning; elsewhere v12's slot rule, `UpdateLayoutConfig`'s by-position reading and the empty argument of `"A" ,` are kept | D452 |
| A structural `$name` could break the model: `$parentBoundary` naming no boundary dropped the element from the drawing, a boundary renamed by `$alias` left the statements in its braces outside the diagram, and an unknown `$typeC4Shape` or `$nodeType`, or `$wrap`, were stored as given | The structure is kept, with one `C4_STRUCTURE_KEPT` warning; v12's other structural names (`$alias` renames, a relation's `$type`/`$from`/`$to`, `UpdateElementStyle`'s `$parentBoundary`/`$typeC4Shape`/`$nodeType`) apply as in v12 | D450, for the maintainer |
| `accTitle:` set the visible title too; the in-text `title` kept its trailing blanks; a front-matter `title` was not drawn; `accDescr` leaked into every later render | `accTitle` sets the accessible name only; the in-text `title` is trimmed; a front-matter `title` is drawn where the in-text one is when the text has none (D218); `accDescr` belongs to its own render | D453 |
| A relation to an alias nothing defines failed at render with `C4 rel "a" -> "b" references an unknown shape or boundary` | The same message, now a parse diagnostic (`C4_UNKNOWN_END`) at the statement | D457 |
| A non-numeric `$offsetX`/`$offsetY` was read as `NaN` | It counts as 0, with one `C4_OFFSET_INVALID` warning | D457 |
| v12's packer placed elements in rows by statement order with fixed widths, wrapping at `screen.availWidth`; boundaries in rows below their parent's header, each `c4BoundaryInRow` a fixed share of the parent | Pele's grid: the same rows by statement order, each boundary sized bottom-up from its contents, with v12's lengths as gaps and margins (`c4ShapeMargin`, `diagramMarginX`/`Y`, `nextLinePaddingX`); the layout no longer depends on the screen | D454 |
| Every row was top-aligned, so a shape beside a person stood level with its head and the relations between them ran to the head; elements stood `2·c4ShapeMargin` apart whatever their relation labels | A row holding a person lines up on the person's body, and relations beside a person end on its body (from above, still on the head); two row neighbours joined by labelled relations stand at least the widest tag between them apart, plus room for the arrowheads; tags of lines closer than a tag are staggered along them, each on its own line. Rows without a person stay top-aligned; text output and c4-beta are unchanged | D679, for the maintainer |
| `c4ShapeInRow` and `c4BoundaryInRow` were never read from the config: the DB hard-coded 4 and 2, which only `UpdateLayoutConfig` changed | Read from the `c4` section as defaults that `UpdateLayoutConfig` overrides | D454 |
| The `c4` section's `height`, `boxMargin` and `wrapPadding` were never read | Ignored ([Removed, moved and ignored keys](#removed-moved-and-ignored-keys)) | D454 |
| `Boundary(global, …)` merged into the top level, which then drew nothing; a boundary reopened inside itself (a parent cycle) was left undrawn | `global` is an ordinary alias; a boundary in a cycle is drawn at the top level, with one `C4_BOUNDARY_CYCLE` warning | D454 |
| `Rel_U`, `Rel_D`, `Rel_L` and `Rel_R` were plain relations | The same: the router picks the route | D455 |
| Relation labels never wrapped: v12 measured each against its own width | With the top-level `wrap` true, a relation label wraps at the room the router leaves (88 px across a column gap, 64 beside a self-loop, else 160); a boundary header wraps at its contents' width or `c4.width`, whichever is wider (v12's limit came from `screen.availWidth`) | D455, for the maintainer |
| Each relation one fixed curve, with no work to limit | The router and label placement count their comparisons against `min(2,000,000, limits.maxLayoutWork)` (1,500,000 by default, R-SEC-5); once spent, the remaining relations are drawn straight with their labels at the middle, never an error | D455, for the maintainer |
| Every `*FontFamily` defaulted to `"Open Sans", sans-serif` | Unset, the theme's `fontFamily` ([Changed defaults](#changed-defaults)); a set family the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning | Sequence's precedent |
| `format: 'ascii'`: no text output | Text output (`@mermaid-js/diagram-c4/ascii`, loaded only for text): the SVG's grid on a character grid, laid out with every text measured in cells of 8 × 16 px. Elements are boxes with the name, `[Kind]` and description (rounded corners, a cylinder's caps, `fr-rect`'s double sides; a line wider than its box cut with `…`, `...` in the ascii charset); boundaries dashed frames, deployment nodes solid ones, with the label in the top border; relations stepped lines routed on the grid round elements and header text, following the routed points, with the label at or beside the middle (with both `wrap` flags set, wrapped narrower where the gap is small; else on one line, cut with `…` where it does not fit) and arrowheads. Config colours and fonts are ignored without a warning; `UpdateElementStyle`/`UpdateRelStyle` colours and offsets, a relation's description and `accTitle`/`accDescr` give one `ASCII_DROPPED` each; a `c4ShapePadding` under 16 or a `c4ShapeMargin` under 32 is raised with `C4_CONFIG_IGNORED`; `ascii.padding: roomy` adds a row round each element's text. Never cropped and never reflowed (the grid is the SVG's): `ASCII_TOO_WIDE` past `ascii.maxWidth`; see [ASCII output](./ascii.md#c4-diagrams) | D459, D320, R-ASCII-5 |
| v12 drew no line hops in C4 diagrams | `lineHops: true` (or `'arc'`, `'gap'`): where two relation lines cross on straight runs, the later one draws a 6px hop (`gap`: a break), through core's shared edge-path step; a relation the router draws as a curve neither hops nor is hopped over there. Relation lines stay plain under `look: handDrawn`. The shared key defaults to `false` (D689), so crossings hop only where a document turns hops on | D537, #655 |

## C4 SVG structure

What changed in the C4 diagram's SVG compared with v12 (spec #522). v12's element classes are
kept: each element is a `g.node.c4-shape.c4-<kind>` (`c4-external` on an external kind) holding
its outline (`label-container`) and its text, `c4-name`, `c4-type` and `c4-descr`. The rest is
new, as v12 wrote no classes there: the title `text.c4-title`; `g.c4-boundaries` > each
`g.c4-boundary` (`c4-deployment-node` on a deployment node) with its `rect` and
`text.c4-boundary-label`, `-type` and `-descr`; `g.c4-elements`; `g.c4-relations` > each
`g.c4-relation` with its `title` (the `descr`), `path.c4-rel.c4-rel-<kind>`, its arrowheads
`path.marker`, and its label as a `g.edgeLabel` (`data-id` `<from>-><to>`) holding the box
`rect` and one `<text>`: the label, then `[techn]` in an italic `tspan`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="c4"`, a `<style>` scoped by the id (per-kind font rules, `.c4-shape` text and stroke rules, a `.person` rule that matched nothing) | No root `id`; `class="mermaid mermaid-c4"`, `role="img"`, `aria-roledescription="c4"` (kept), `data-mermaid-version`, `<title id="<id>-title">` and `<desc id="<id>-desc">` from `accTitle` and `accDescr`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): fills, strokes, widths and fonts are presentation attributes, theme colours reading `var(--_x)` aliases on the root `style` | R-SEC-2, R-A11Y-1, R-THEME-3 |
| `<defs>` with unused `<symbol>` icons (database, computer, clock) and four `<marker>`s, of which `arrowhead` and `arrowend` were used | No `<defs>`, `<symbol>` or `<marker>`: each arrowhead is drawn inline after its line as `path.marker` | DESIGN §7.1 |
| Arrowheads in the page's text colour (the marker took the root's `fill`), whatever `$lineColor` said, the tip 1 px past the outline (`refX 9` of a 10 px head) | The same colour (`textColor`), the tip on the outline | v12; the line stops at the outline |
| Element ids `<render id>-<alias>` | No ids: `data-id` (the alias) and `data-ast` on each element's `g.node` and each boundary's `g`; a relation's `path` carries `data-ast` and `data-id` (`<from>-><to>`); text carries `data-id` only | R-ARCH-6, R-PARSE-8, D458, pitfall 12 |
| Boundaries drawn after their contents, so a boundary's `$bgColor` painted over its shapes | Boundaries first (parents before children), then elements, then relations | Spec #522 |
| The first relation a `<line>`, the others a quadratic curve through a fixed control point; labels to the right of the midpoint by half their width, no background | Each relation one `path` along the routed line (straight, bent round shapes, or a self-loop), its label and italic `[techn]` placed along the line where they cover least; where the line has no room (a label wider than the gap between neighbours), beside it, a label's depth further out at each step, never over its own arrowheads, an element or a boundary header | D455 |
| Relation labels had no background: they sat beside the curve | The label and `[techn]` are one tag, as every edge label: a `g.edgeLabel` with a rounded box (`rx` 6) bordered 1 px solid in the relation's line colour (`$lineColor` or a c4-beta `stroke` when set, never its dashes), filled with `c4EdgeLabelBackground` (the shared `edgeLabelBackground`, the page's `background` unless set) and inked with `c4EdgeLabelColor` (`textColor` where it reads on the tag, else black or white; a `$textColor` or c4-beta `color` as written; `c4RelationColor` no longer colours the label text, only the lines), with 8 px of room each side and 4 px above and below, which the layout reserves, so labels sit a little further out. The classes `rect.c4-rel-label-box`, `text.c4-rel-label` and `text.c4-rel-techn` are gone: select `g.c4-relation g.edgeLabel` and its `text` instead | D455, D626–D629, D713–D715 |
| A relation's `descr` was never drawn | The relation group's SVG `<title>` | D455 |
| The title a `<text>` at `x = boxWidth/2 − 4·diagramMarginX`, in a row above the diagram reached by a negative-y viewBox | `text.c4-title` centred over the diagram in a 60 px row at the top of a `0 0 width height` viewBox | D224 |
| `$link`, `$sprite`, `$tags` (but shape words), `$shadowing` and `$legend*` parsed and not drawn | The same: no `<a>`, no icon, no 48 px sprite gap on a boundary | D457 |
| `$bgColor`, `$fontColor`, `$borderColor`, `$textColor`, `$lineColor` and the 40 config colours written raw: a misspelt one (`$bgColor="redd"`) fell back to the inherited paint on a boundary or relation | Each through core's colour check: a value it refuses, a misspelt colour included, is dropped and the default drawn, with one `C4_COLOR_INVALID` warning per render naming each | R-SEC-2, D690 |
| A boundary's `$fontColor` was set and never drawn (its text was always `#444444`) | The same: its text is `c4BoundaryColor` (`#444444` in light themes) | v12 |
| Relations and boundaries `#444444` literals, the title the page's text colour, in every theme: dark on dark in the dark themes | Theme variables `c4RelationColor`, `c4BoundaryColor`, `c4TitleColor`. Relations take the page's `textColor` in every theme, so they are no longer `#444444` (`#333333` in default, base and neo, `#000000` in forest and neutral, `#28253d` in redux and redux-color, `#cccccc` in the dark themes). The dark rule `c4RelationColor: lineColor` (under a dark theme or `darkMode`) is gone, so a dark theme's relations follow `textColor`, not `lineColor`. `c4RelationColor` colours the relation lines only: the label text is `c4EdgeLabelColor`. Boundaries keep v12's `#444444` in light themes and take `nodeBorder` under a dark theme or `darkMode` | D456, D333(b), D714 |
| `look: neo`: the cylinder, the queue and `fr-rect` padded with v12 neo's 24, 12 and 28 × 12 | Read from the theme's `cylinderPadding*` (the queue half of it) and `subroutinePadding*`: neo's values in the redux and neo themes, `2 · c4ShapePadding` in the classic ones. No gradient or shadow in any family, as v12 | D152, D227 |
| Text by `<text>` per line with `dominant-baseline: middle` and CSS font sizes (`0.75em` type line, `0.82em` description) | Core's label layout: `text`/`tspan` placed by their measured boxes, each in the font it was measured in (`font-size` in px, `font-family` where a `c4.<kind>FontFamily` sets one) | Pitfall 16 |
| The `viewBox` from the packer's bounds, which depended on `screen.availWidth` | The layout's canvas: everything drawn, the config margins round it and the title row | D224, D454 |
| Hand-drawn: elements sketched by roughjs | Elements through the outline hook (`node`, and `divider` for the cylinder's and the queue's rim and `fr-rect`'s frame lines); boundaries and relation lines plain, as v12; a relation label's border sketched (`label`), as every edge label's | D301, D302, D630 |

## Event modeling

The event modeling parser accepts the v12 language, `eventmodeling` (oracle parity over every e2e
fixture, the v12 spec strings and the syntax page; grammar in
[syntax/eventmodeling.md](./syntax/eventmodeling.md)). Lanes, relations, box order and v12's
placement constants are kept (spec #527). What changes:

| v12 | v13 | Why |
| --- | --- | --- |
| Syntax errors: Langium's first message, naming tokens; a duplicate frame id threw | Every error, in words, with hints for the usual slips (a keyword as a name, `title` at a line start, upper-case keywords, parts out of order, a four-digit id, block data written inline). A duplicate frame id is the error `EVENTMODELING_DUPLICATE_FRAME`, with v12's message, at the second id | R-PARSE-1 |
| A source of the wrong kind, a `->>` to a later or undefined frame, an undefined `[[data]]` and a `note` or `gwt` on an undefined frame were dropped silently (the first was reported only by the unused validator) | The same output, with one warning per render for each kind: `EVENTMODELING_INVALID_SOURCE` (v12's validator message), `EVENTMODELING_UNKNOWN_SOURCE`, `EVENTMODELING_UNKNOWN_DATA`, `EVENTMODELING_UNKNOWN_FRAME`, every case in `related` | D525, D226 |
| `%%` comment lines were kept for parsing (`preserveCommentsWhenParsing`), except in a text over `maxTextSize` (50,000), which v12 parsed with the comments stripped | Comment lines are always kept, whatever the text's length | Spec #527 T1 |
| A new lane for every namespaced frame, so two frames of one namespace in one band could draw two lanes of the same name | One lane per band and namespace, as the syntax page says | D522 |
| Data drawn as HTML through `foreignObject`, sliced off by one: empty quoted data, a lost last character, `&nbsp;` spaces; tags, entities and `<br/>` read as markup; a referenced data block drew a trailing blank line | The text between the braces or quotes, dedented and trimmed, in mono, as written: indentation and blank runs kept (a tab to the next 4-column tab stop, before dedenting), empty data drawn as no data, `<tags>`, `&entities;` and `<br/>` shown as text, no trailing blank line. `dataType` is still ignored | D523 |
| `title`, `accTitle` and `accDescr` values kept their keyword, `:` and blanks | The keyword, `:` and surrounding blanks are stripped, as for every other type; `accTitle` and `accDescr` become the SVG's `<title>` and `<desc>`. The `title` is not drawn, as in v12 | D524, D218 |
| Box sizes from 16 px bold trebuchet markup strings, a box with data at a third of its width | Boxes sized from the name and data measured in the theme's font (each `clamp(text + 20, 80, 450) + 20` wide, `clamp(text + 20, 80, 750) + 20` high, v12's bounds), so boxes and every later x differ | D521 |
| A box could overlap or touch (less than 10 px from) its lane's previous box | It moves right to 10 px past it; later boxes follow | D521 |
| A relation within a lane ran from one box's middle through both boxes, and through every box between them; a frame named as its own source drew a line through its box | A relation to the next box of its lane runs from the source's right edge to the target's left edge. One that skips boxes of its lane runs under the row, from the source's bottom to the target's bottom, overlapping ones 10 px apart. A self relation loops under the box's bottom right corner. A lane that holds such a route or loop is taller, so the lanes below it move down; box tops in their lane stay | D521, D659 |
| Text past the greatest box height (750 px) was clipped by the `foreignObject`, mid-line | Lines past it are left out, data lines first, then name lines | Spec #527 T3 |
| Lanes reached 15 px past the rightmost box, unless an earlier box ended right of the last one | Lanes reach 25 px past the rightmost box | Spec #527 T3 |
| Notes, `gwt` blocks and entities were parsed and not drawn | The same: in the model and the language service, not drawn | D526 |
| An `eventmodeling.padding` that was not a number was used as given | A number of 0 or more, or a numeric string as its number; anything else (or a value so large the drawing would not stay finite) draws with 30 and one `EVENTMODELING_CONFIG_INVALID` warning. A `useMaxWidth` that is not `true` or `false` draws as `true`, with the same warning | D226 |
| `eventmodeling.rowHeight` (default 32) and `eventmodeling.useWidth` were never read | Accepted and ignored, with no warning ([Config](#config)) | |
| `look: handDrawn` (top level or `eventmodeling.look`): v12 never sketched an event model | Without `@mermaid-js/plugin-hand-drawn`, `look` is ignored with one `LOOK_REMOVED` warning, as in every section. With the plugin, `look: handDrawn` sketches the event model: lanes, boxes and relations are drawn with roughjs, as other edge diagrams are; the arrowheads and the text are drawn as before. A visible change from v12, which drew it plainly (option A, decided by the maintainer on 2026-11-10, with D537's line hops; the D-id is the maintainer's to number) | D301, D303, D537 |
| `lineHops: true` (or `'arc'`, `'gap'`) on crossing relations | New in v13 (D537): event modeling relations go through core's shared edge-path step, so where two cross the later one draws a 6px hop. The shared key defaults to `false` (D689), so crossings hop only where a document turns hops on. v12 had no hops for event models | D537 |
| `format: 'ascii'`: no text output | Throws `UnsupportedFormatError` | D320, R-ASCII-5 |

### Event modeling theme colours

Event modeling reads its own 14 flat theme variables, v12's names (`emUiFill`, `emUiStroke`,
`emProcessorFill`, `emProcessorStroke`, `emReadModelFill`, `emReadModelStroke`, `emCommandFill`,
`emCommandStroke`, `emEventFill`, `emEventStroke`, `emSwimlaneBackgroundOdd`,
`emSwimlaneBackgroundStroke`, `emRelationStroke`, `emArrowhead`), and one new one, `emTextColor`
(core's `textColor`), for box and lane text, which v12 left to the page's colour. Every light
theme of every family draws v12 `default`'s values, relations and arrowheads in the theme's line
colour (`canvasLineColor`: `lineColor`, which `default` and `dark` keep under an override, as v12
does, D656); the dark themes draw v12 `dark`'s. An author's value is drawn as given in every theme, as in v12; the
author's `darkMode` alone keeps the light values, as in v12. What changed
(`packages/conformance/src/eventmodeling/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `neo-dark` | No `em*` variables: the renderer's light fallbacks (`default`'s pastels, `rgb(250,250,250)` lanes) and `#000` relations and arrowheads | `dark`'s values (`#2d2d2d` UI boxes, the darker kind colours, lanes 5% and 12% lighter than the background) and `lineColor` relations | D527, D333 |
| `redux-dark` | The same light fallbacks and `#000` relations | `dark`'s values and `lineColor` | D527, D333 |
| `redux-dark-color` | The same light fallbacks and `#000` relations | `dark`'s values and `lineColor` | D527, D333 |
| Every theme | Box and lane text in the page's colour (black on a dark lane in `dark`) | `emTextColor`, core's `textColor` | D527 |

## Event modeling SVG structure

What changed in the event model's SVG compared with v12 (spec #527, DESIGN §7.2). v12's class
names (`em-swimlane`, `em-box`, `em-relation`) and its draw order (lanes, then boxes, then
relations) are kept.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"` and v12's `role` | No root `id`; `class="mermaid mermaid-eventmodeling"`, `role="img"`, `aria-roledescription="eventmodeling"`, `data-mermaid-version`, `font-family` from the theme; the `viewBox` is what is drawn plus `padding`; `useMaxWidth` as v12 (`width="100%"`, `max-width`) | R-SEC-2, R-A11Y-1 |
| `<defs>` with `<marker id="em-arrowhead-<id>">` and `marker-end` on every relation | No `<defs>`, `<marker>` or `marker-end`: each `path.em-relation` is followed by its own `<polygon>` head (v12's `0 0, 10 3.5, 0 7`, filled `emArrowhead`). The only ids are `<id>-title` and `<id>-desc`, from `accTitle` and `accDescr` | R-SEC-2, D133 |
| Box text in a `foreignObject` holding XHTML `div`s and `span`s | SVG `<text>` and `<tspan>` through core label layout: the bold name centred, the data in mono, left-aligned, its indentation kept; data is text, never HTML | R-SEC-2, D523 |
| Lane labels as HTML-less `<text>` at (30, `y + 30`) in the page's colour | `<text>` start-anchored at the same point, bold, filled `emTextColor` | D527 |
| Text at v12's 16 px | Text in `emTextColor` at the theme's `fontSize` | D527 |
| A self relation drew a straight line through its box | A 4-point path under the box's bottom right corner, as is a relation under its row (one that skips boxes of its lane); every other relation is `M…L…`, as v12, ending at its head's tip | D521, D659 |
| Relations were always straight lines, or right-angled routes under a row; no curve key | Unset, the same lines and heads, byte for byte. The new `eventmodeling.curve`, then the new top-level `curve`, draw every relation between frames with `flowchart.curve`'s names (`linear`, `step`, `rounded`, `basis`, …): the line stops at the head's base and the head follows the end of the drawn line. A relation from a frame to itself keeps its loop whatever the curve. An unknown name draws `rounded` with one `CURVE_UNKNOWN` warning. Event modeling has no text output | D733, D760 |
| No source mapping | `data-id` on every element; `data-ast` on each `g.em-box` (`frame:<id>`) and each `path.em-relation` drawn for a `->>` (`relation:<source>-><target>`, the first `->>` of that source). A source repeated in one frame (`->> 01 ->> 01`) draws one path; the AST nodes of its repeats (`relation:01->02@2`, …) are not drawn. Lanes (`lane:<index>`) and inferred relations carry `data-id` only | R-PARSE-8, D528 |
| `rgb(250,250,250)`, `rgb(240,240,240)` and `white` paints | The same colours as hex | |
| `look: neo` and the redux themes: the same model as the classic themes | The same: event modeling differs between families by colour only | D227 |

## Swimlane diagrams

`swimlane-beta` renders again, through the flowchart plugin with the `swimlane` layout engine
(D534). It is flowchart's syntax, parser, AST and language support with another layout; each
top-level subgraph is a lane, and nodes outside every subgraph go to one default lane.

- **Detection and type.** v12's detector, `swimlane-beta` at a word boundary, in v12's place
  (after `sequenceDiagram`, before `graph`/`flowchart`). `detectType` and `diagramType` report
  `swimlane`, as in v12. `@mermaid-js/diagram-flowchart` draws it; nothing else needs installing.
- **Layout.** The default layout is `swimlane`, a default below every config layer: `layout:
  dagre` (or `layered`) at the top level, in `swimlane.layout`, in front matter or in a
  directive moves a swimlane diagram onto layered, as v12's `swimlanesDiagram.spec.ts` asserts.
  `swimlane-beta` may also take `elk` (D535). Any graph diagram may select `layout: swimlane`
  too (D535).
- **Config.** `swimlane` is the diagram's section on top of flowchart's. Lowest first:
  flowchart's defaults, swimlane's defaults, the author's `flowchart.*`, the author's
  `swimlane.*` (in each source; a later source, front matter or a directive, still outranks
  `initialize()`). So `flowchart.layout: elk` or `flowchart.theme` moves a swimlane diagram
  unless `swimlane.layout` / `swimlane.theme` is set too, and a key both sections have
  (`theme`, `layout`, `useMaxWidth`, `useWidth`, but not `curve`, D761) resolves the same way
  in both. An `%%{init: {"config": …}}%%` key goes to `swimlane` when it is one of swimlane's
  own keys (`theme`, `layout`, `useMaxWidth`, `lineHops`, `curve` and the three below), else
  to `flowchart` (v12 sent all of it to `swimlane`). `flowchart.*` keys (spacing, curve, labels, padding) apply as
  in v12. `swimlane.look` is ignored, as `look` is everywhere (D153).
- **Engine keys**, all honoured as in v12: `swimlane.ignoreCrossLaneEdges` (default `true`:
  each lane is ranked on its own edges), `optimizeRanksByCrossings` (default `true`; as in v12
  it acts only when `ignoreCrossLaneEdges` is `false`) and `automaticLaneOrdering` (default
  `false`: lanes keep their source order; `true` reorders them so busy lanes sit together).
- **Curve.** Edges draw `rounded` unless the author sets a curve. v12's engine forced `rounded`
  when the curve was unset or `basis`; in v13 an author's curve (`basis` included) wins: a
  per-edge curve or `linkStyle default interpolate`, then the new `swimlane.curve`, then
  `flowchart.curve`, then the new top-level `curve` (D733). `swimlane.curve` wins whenever it
  is set, from any source: an `initialize()` `swimlane.curve` beats a front-matter
  `flowchart.curve`. Config does not copy `curve` between the two sections, as it does the
  keys both have. A flowchart drawn with `layout: swimlane` ignores `swimlane.curve`: it is the
  diagram's key, not the layout's (D761).
- **Lanes** draw as v12's swimlane cluster: `g.cluster.swimlane` holding `rect.swimlane-body`
  (unfilled) and `rect.swimlane-title` (filled `clusterBkg`), both stroked `clusterBorder`,
  then the label. The title band is on top for `TB` and `BT`, and on the left, its label turned
  to read upward, for `LR` and `RL`. **Fixed:** v12 turned only `LR`, so `RL` lanes got a top
  band over a left-reserved layout; in v13 `RL` matches `LR` (D536). The default lane (nodes
  outside every subgraph) has no label, `data-id="__swimlane_default__"` and the palette slot
  after every subgraph's, as in v12. A subgraph inside a lane is a plain subgraph box. The
  same lanes draw for any flowchart with `layout: swimlane` (D535).
- **Lane colours.** In the colour themes (`redux-color`, `redux-dark-color`) each lane takes
  flowchart's per-subgraph palette slot (`data-color-id`) on both halves, stroke and, where the
  theme has a background palette, fill: what v12's `[data-color-id]` lane rules drew, now as
  attributes. An author's `style` or `classDef` still wins. Lanes have no drop shadow (v12
  turned it off), and a lane without a slot is stroked `clusterBorder`, never the neo gradient.
  No new theme variables. With the hand-drawn plugin both halves are sketched (D301).
- **Markdown in lane titles only in markdown strings** (D710). v12 read a lane title as
  Markdown, so `subgraph lane1 ["**Bold** lane"]` drew `Bold` bold. Now only a title wholly in
  backticks is read as Markdown, with or without double quotes around them
  (`` ["`**Bold** lane`"] `` or `` [`**Bold** lane`] ``), and is drawn without its backticks; in
  any other title `**`, `_` and backticks are drawn as written. Wrap the title in `` "`…`" `` to
  keep the old look. `<br>`, the drawn tags (`<b>`, `<i>`, `<u>`, `<s>`, `<sub>`, `<sup>` and
  their synonyms) and entity codes work in every lane title. A subgraph nested in a lane, and a
  flowchart subgraph, keep flowchart's reading, where only `` "`…`" `` is a markdown string.
- **Shape-data labels are plain text** (#1368, #1432), as in flowchart. v12 read a node label
  written in shape data with no `labelType` as Markdown, so `a@{ label: "**Bold**" }` drew
  `Bold` bold. Now the value is read as Markdown only when it is a markdown string
  (`` a@{ label: "`**Bold**`" } ``), without its backticks; otherwise `**`, `_` and a code span
  are drawn as written, with one `MARKDOWN_NOT_READ` warning. A written `labelType` is read as
  before, and `markdownAlwaysOn: true` draws every label as Markdown.
- **Long lane titles.** v12 let a lane title wider than its lane run past it; v13 widens the
  lane across the flow to the title plus 20px each side.
- **Warnings** (D226, D536), raised at layout and only when the `swimlane` engine lays the
  diagram out, where v12 only logged: `SWIMLANE_SHARED_NODE` for a node (or subgraph) listed in two lanes, directly or in a
  subgraph nested in one (it stays in the first;
  `astIds` names both lanes) and `SWIMLANE_NESTED_LANE` for each subgraph nested in a lane
  (`astIds` names it). **Changed:** v12 removed a lane that a shared node left empty; v13 draws
  it as an empty lane, so every subgraph stays in the SVG with its `data-ast`.
- **Edge labels are tags**, as in flowchart (D626–D630): a rounded box bordered 1 px solid in
  the edge's colour and filled opaque with `edgeLabelBackground` (the theme background unless
  set), the same inside a coloured lane. Edges reserve the matching room.
- **Line hops** (D537). Crossing edges hop by default under the swimlane engine
  (`swimlane.lineHops`, default `arc`; `gap` cuts the run that gives way instead, `false` draws
  it unbroken), as in v12. The shared top-level `lineHops` is new and off by default (D689),
  so it changes nothing here unless set: `lineHops: false` turns hops off everywhere, swimlane included, and an author's `swimlane.lineHops` beats the top-level
  key under this engine. Crossings are found on straight runs only, as in v12: a rounded corner
  or a smoothed curve is never hopped, and unlike v12 the corners of an edge that hops keep
  their rounding. Also unlike v12, crossings on one run too close for a hop each (closer than
  about 7px) share one merged hop, as tall as the others, where v12 drew none (D650, #793).
- **Layout differences from v12's engine** (D532: the engine is v12's, ported; these are the
  places it differs):
  - An empty lane, or one a shared node left empty, gets a band of its own (its title's width
    plus padding across, the other lanes' length along); v12 shrank it to nothing.
  - A subgraph inside a lane grows by its own padding on each side; v12 split one padding
    between the two sides, so nested boxes are a little larger.
  - Lanes grow so that routes and edge labels stay 10px inside them; with flowchart's 20px
    subgraph padding, v12's outer routes ran along the lane border.
  - `LR` and `RL` route on the drawn (turned) sizes; v12 routed `RL` with `TB` widths, so its
    detours could miss boxes or cut through them.
  - Labelled self-loops are routed through their label, and unlabelled ones take a free side;
    v12's router skipped self-loops. A route end v12 left off its box is put back on it.
  - A labelled edge to or from a subgraph puts its label in the row of its ranked end, beside
    that lane's nodes; v12 put it on top of the other end.
- **Integrators.** Lane drawing is flowchart's own lazily loaded part, `flowchartLanes`
  (`@mermaid-js/diagram-flowchart/lanes`), loaded alongside the `swimlane` engine for
  flowcharts only, so a plain flowchart, or a class diagram with `layout: swimlane`, loads none
  of it. `render()`, `prepare()` and `preload({ types: ['swimlane'] })` load both; for a
  `flowchart` with `layout: swimlane`, `preload({ layouts: ['swimlane', 'flowchartLanes'] })`.
  Lanes are drawn only on a render mermaid's own `swimlane` engine laid out: an engine
  registered under another name, or a loader registered under `swimlane` itself, draws the
  groups as plain subgraphs, and a placeholder render that lacks the part says so in its
  `PLACEHOLDER` warning. A plugin's `layoutParts` is first-party only: any other entry is
  ignored.
- **`format: 'ascii'`** (new; v12 had no text output) draws the flowchart with `layered`, lanes
  as plain subgraph frames with no title band or default lane, in both charsets, with one
  `ASCII_DROPPED` warning (`feature: 'layout'`) and no `SWIMLANE_*` warning, as for any engine
  text output does not use (D179, D534); a flowchart with `layout: swimlane` draws the same.

## Ishikawa diagram

The ishikawa parser accepts the v12 language (`ishikawa` and `ishikawa-beta`, any case; oracle
parity over the corpus, grammar in [syntax/ishikawa.md](./syntax/ishikawa.md)), and the layout
is v12's fishbone geometry, ported into the package (D491). The layout also fixes two v12
overlaps (below), which await a maintainer decision (D499); with those fixes off, every
compared corpus source lays out as v12 drew it. What changes (spec #519):

| v12 | v13 | Why |
| --- | --- | --- |
| The effect was also stored as the diagram title (`setDiagramTitle`); no title was drawn, and the SVG had no `<title>` | No title is drawn. The SVG `<title>` is the front-matter `title` when one is given, else the effect as drawn, as plain text (entities decoded, a `<br>` or a wrap a space) | D492, D218, R-A11Y-1 |
| Cause and sub-cause labels were laid out at the config `fontSize` (16) and drawn at the theme's | Measured and drawn at the theme's `fontSize`, one source: classic themes are unchanged; in `neo` and the redux themes (14 px) the bones fit the text they draw | D493 |
| The effect was drawn at 14 px, weight 600, and wrapped at `max(6, floor(110 / (fontSize × 0.6)))` characters of the config `fontSize` (11) | The same 14 px 600 in every theme (D493), measured, and wrapped at 110 px scaled by the size it is drawn at: `110 × 14 / 16 = 96.25` px in every theme, the same 11 characters at 0.6 em. D495's literal rule, `110 × fontSize / 16`, would give 110 px (13 characters) in the classic themes | Awaits a maintainer decision (D499) |
| Sub-causes wrapped greedily at 15 characters, breaking between words (a longer word kept whole), `<br>` counted as characters; cause labels never wrapped | Core's label layout (D225): entities, `<br>` forms, math and icons work. Sub-causes wrap at `144 × fontSize / 16` px; cause labels still never wrap, only break at `<br>` | D495 |
| Labels passed through `sanitizeText` (DOMPurify) | Text is escaped when written, never sanitised. Labels take the label subset ([Labels and text](#labels-and-text)): `<b>`/`<strong>` and `<i>`/`<em>` are drawn bold and italic and `<br>` breaks the line; other HTML element tags, `<script>` and `<img>` among them, are dropped and their text kept; text that only looks like a tag, such as `<T>`, is shown as written | R-SEC-1 |
| The first pair of causes always started 20 px left of the head, so a short leaf cause's label box could sit on the head (`baseline-clamp`, fixture 13) | A pair whose box would reach over the head's back on the head's rows starts further left by the overlap | The layout invariant (no label over the head); a visible change no D-id covers, awaiting a maintainer decision (D499) |
| A leaf cause's bone was 20 % of its side's length, so a tall (`<br>`) label on a short bone was drawn across the spine | A cause bone is at least long enough that its label box clears the spine (`(h/2 + 2 − 11) / sin 82°`). With both fixes, 66 of the 481 compared corpus sources move; the rest equal v12 | The layout invariant (no label across the spine); a visible change no D-id covers, awaiting a maintainer decision (D499) |
| Causes indented less than the first cause were read as top-level causes, silently | The same reading, with one `ISHIKAWA_INDENT_CLAMPED` warning; its message names every clamped cause and its line (the first ten, then how many more) and the diagnostic's `related` lists them all; the editor reports each one as information | D496 |
| An empty body (no effect) drew an empty SVG with no `viewBox`, silently | Still nothing drawn, with one `ISHIKAWA_EMPTY` warning; the root gets a `viewBox` of the padding about the origin ([Ishikawa SVG structure](#ishikawa-svg-structure)) | D496 |
| The `viewBox` was `getBBox()` of the drawing plus `diagramPadding`, strokes left out | Computed from the layout, half of each stroke included (≤ 1 px larger), plus `diagramPadding` | D224 |
| `ishikawa.useMaxWidth` was documented with default `false`, but the runtime config gave `true` | Default `true`, the value v12 drew with ([Changed defaults](#changed-defaults)) | P2 |
| An `ishikawa.diagramPadding` that was not a number reached the renderer as it was | A number of 0 or more, or a numeric string as its number; anything else lays out with the default 20, with no warning | No `NaN` in the output |
| No text output | `format: 'ascii'` draws an outline, not the fishbone: the effect in a box, the causes below it as a `tree(1)`-style tree in source order (`├── `, `└── `, `│   `; `\|-- `, `` `-- ``, `\|   ` in the `ascii` charset), labels as plain text (entities decoded, a `<br>` a space), the front-matter `title` centred on the first line (an empty body draws the title alone); bold and italic are dropped with one `ASCII_DROPPED` warning, and math and icons are shown as written with one `ASCII_DROPPED` warning each | D498, D320, D82 |

## Ishikawa SVG structure

What changed in the ishikawa diagram's SVG compared with v12 (spec #519). v12's classes and draw
order are kept: `g.ishikawa` holds `line.ishikawa-spine`, `g.ishikawa-head-group`
(`path.ishikawa-head`, `text.ishikawa-head-label`) and a `g.ishikawa-pair` per pair of causes,
each with its `line.ishikawa-branch`, `g.ishikawa-label-group` (`rect.ishikawa-label-box`,
`text.ishikawa-label.cause`) and a `g.ishikawa-sub-group` per sub-cause
(`line.ishikawa-sub-branch`, `text.ishikawa-label` with `align`, `up` or `down`).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="ishikawa"`, a `<style>` scoped by the id for strokes, fills and fonts | No root `id`; `class="mermaid mermaid-ishikawa"`, `role="img"`, `aria-roledescription="ishikawa"` (kept), `data-mermaid-version`, and `<title id="<id>-title">` (D492). No `<style>` (except `theme: 'auto'`'s variables-only sheet): `stroke`, `fill`, `stroke-width`, `font-size` and `font-weight` are attributes on each element, colours reading `var(--_x)` aliases (`lineColor`, `mainBkg`, `textColor`) on the root `style`, and `font-family` on the root | R-SEC-2, R-A11Y-1, D133, R-THEME-3 |
| Arrowheads: `marker#ishikawa-arrow-<id>` in `g.ishikawa > defs`, `marker-start` on every branch and sub-branch, scaled by the stroke width (12 px and 6 px) | No `<marker>` and no `<defs>`: a filled `path.ishikawa-arrow` after each branch and sub-branch, the same 12 px and 6 px triangle with its tip at the bone's start | R-SEC-2 (no ids but `-title`), D302 |
| The head group was translated to the spine (`transform="translate(0, spineY)"`), its label by a `translate` from `getBBox()` | Every element at absolute coordinates: no `transform` anywhere | Layout before render |
| Sub-cause labels: `text-anchor: end` at the bone's end, `tspan` lines | `text-anchor="start"` at measured per-line indents, so each line ends at the bone's end (right-aligned, as v12's); head and cause labels centred, as v12's style sheet | `w.label` has no end anchor |
| The spine was drawn first and its length set after the pairs (hand-drawn: drawn last) | The spine first in both looks: its length is known before drawing | Layout before render |
| No source mapping | `data-ast` on the head group, each cause's label group and each sub-cause's sub-group; `data-id` (the AST id: `effect`, `cause:<i>.<j>…`) on bones, arrowheads and text, the spine carrying `effect` | D497, R-PARSE-8 |
| An empty body: an `<svg>` with no `viewBox` and nothing in it | The root only (with a `<title>` when the front matter has a `title`), no `g.ishikawa`, and a `viewBox` of the padding about the origin | D496 |
| `look: neo` and the redux and neo themes: the same shapes as the classic themes | The same: ishikawa differs between families by colour and font size only | D227 |

Hand-drawn (`@mermaid-js/plugin-hand-drawn`): v12 sketched the head and label boxes at roughness
1.5 with a hachure of `mainBkg` (fill weight 2.5, gap 5, stroke 2), the spine and bones at
roughness 1.5, and the arrowheads as rough solid triangles. D494 asks for those parameters; v13
does **not** reproduce them. It sketches the head and label boxes as `node` outlines and the spine
and bones as `edge` outlines at the drawer's defaults for those roles (node roughness 0.7,
hachure fill weight 1.5, gap 1.5; edge roughness 0.3), since the outline hook takes no per-call
options and D304 keeps roughness below 1. This awaits a maintainer decision (D499). Arrowheads
are drawn plain, as without the look (D302); text is never sketched, as in v12.

## Railroad diagram

The four railroad parsers accept v12's four languages (`railroad-beta`, `railroad-ebnf-beta`,
`railroad-abnf-beta`, `railroad-peg-beta`; oracle parity per notation over the corpus, grammars
in [syntax/railroad.md](./syntax/railroad.md), [syntax/railroad-ebnf.md](./syntax/railroad-ebnf.md),
[syntax/railroad-abnf.md](./syntax/railroad-abnf.md) and
[syntax/railroad-peg.md](./syntax/railroad-peg.md)), v12's lexer quirks included (D513), and
the layout is v12's (D514). One package draws all four, with one `railroad` config section
(D511). What changes (spec #526):

| v12 | v13 | Why |
| --- | --- | --- |
| A rule name was measured at normal weight and drawn bold, so a long bold name ran into its start marker | The name is measured bold: the start marker, the definition and the end marker move right by the difference between the bold and normal widths (a few px for a short name), and the diagram widens by as much | D514 |
| A choice branch closer than `2 × arcRadius` to the main line (a small font, or a large `arcRadius`) was drawn with arcs that overshot it, the vertical piece running backwards | That branch, and every branch beyond it on the same side, moves out to `2 × arcRadius` from the main line, so the arcs meet it; the main line is then no longer at half the choice's height. An optional's bypass and a repetition's loop sit `max(2 × arcRadius, verticalSeparation)` from the element (v12: `2 × arcRadius`). With v12's defaults, only choices v12 overshot change | D514 |
| The schema documented defaults for `railroad.fontSize` (14), `railroad.fontFamily` (`monospace`) and the colour keys, which v12's runtime config reset, so the theme's were drawn | No documented default: unset, the theme's font and the theme's railroad variables are drawn, as v12 drew them. Set, each wins over the theme, as in v12 | D515 |
| The `railroad` keys `compactMode`, `showMarkers`, `commentFill`, `commentStroke` and `commentTextColor` were read and drew nothing different | Ignored (listed under [Config](#config)) | D515 |
| `themeVariables.railroad.<key>` reached v12's style sheet; the terminal fill was `secondBkg ?? secondaryColor` | Railroad's own theme variables (`railroadTerminalFill` … `railroadRuleNameColor`), each also read as `themeVariables.railroad.<v12 key>`; every theme draws 12.2.0's colours (see [Railroad SVG structure](#railroad-svg-structure)) | D516 |
| A rule defined twice: both drawn, with a `log.warn` | Both drawn, with one `RAILROAD_DUPLICATE_RULE` warning | D517 |
| `format: 'ascii'`: no text output | Text output from the lazily loaded `@mermaid-js/diagram-railroad/ascii` entry: the SVG geometry at cell scale (`─` track, `╭╮╰╯` corners, `┬┴├┤` where branches leave and join, rounded terminals, square nonterminals, dotted specials, `●` markers; `/` `\` terminal corners, `+` and `o` in the `ascii` charset), choices centred, the bypass above and the loop below, no repeat count and no title, as in SVG. A diagram wider than `ascii.maxWidth` is drawn whole with `ASCII_TOO_WIDE`. The `railroad` colours, font and px lengths are not read: one `ASCII_DROPPED` each for the colours and font, and for the lengths, set; one for `accTitle`/`accDescr` | D320, D518 |
| Entity codes in a terminal, nonterminal or special (`"#lt;tag#gt; #35;"`) drew their characters (`<tag> #`) | The same, in the SVG and in text output, in all four notations; the box is sized for the characters. A reference typed with `&` (`&amp;`) is decoded only in a special sequence, which follows the label rule; in a terminal, nonterminal, rule name or PEG predicate it stays as written, as in v12 (D710). A `#name;` Mermaid does not know stays as written (D561) | D563, D710, #656 |
| A terminal's text was measured and drawn by the browser with its spaces collapsed: `"a  b"` drew as `a b`, and an empty or blank terminal (`""`, `" "`, `"\t"`) was a 20 × 20 circle | A terminal is drawn as written, in a box sized for it: its `text` keeps its spaces (`xml:space="preserve"`, where a space at either end, two in a row, a tab or a line break needs it) and a tab or line break is drawn and measured as a space. An empty or blank terminal is still the 20 × 20 circle. Nonterminal and special texts still collapse their spaces, as in v12 | #774 |
| Every text was drawn with d3's `.text()`, so a special sequence (`? a<br>b ?`, `? <b>x</b> ?`, `` ? `**x**` ? ``) showed its tags and backticks as characters, on one line | Terminals, non-terminal names and rule names are still drawn as written: `"<b>x</b>"` and `` "`**x**`" `` show their tags and backticks, as gitGraph keeps its identifiers (D268). A special sequence follows the label rule of every other type: `<br>` breaks the line, `<b>`/`<strong>`, `<i>`/`<em>`, `<u>`/`<ins>`, `<s>`/`<strike>`/`<del>`, `<sub>` and `<sup>` draw their formatting without the tags, and a special written wholly in backticks (`` ? `**bold** *italic*` ? ``) is a markdown string, drawn as Markdown without its backticks; `**x**` without backticks stays as written. Its dashed box is sized from the measured lines, so a `<br>` makes it taller. Text output (`format: 'ascii'`) draws such a special's plain text on one row (`? a b ?`). A special with none of these is drawn as before. The title and comments are still not drawn (D218) | D710 |
| A PEG predicate (`&"x"`, `!b`), like a terminal, a nonterminal and a rule name, was drawn with `.text()`: a tag, Markdown and a reference typed with `&` (`&lt;`) showed as written | The same, in the SVG and in text output: a PEG predicate is drawn exactly as written, as the tokens are, and a typed `&lt;` stays `&lt;` in all of them (earlier v13 alphas decoded it, D563). A Mermaid code (`#lt;`) is still drawn as its character, as v12 drew it. Only a special sequence (`? … ?`, `special("…")`) follows the label rule | D710 (amends D563 for railroad) |

## Railroad SVG structure

What changed in the railroad diagram's SVG compared with v12 (spec #526, DESIGN §7.2), for all
four notations (`railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`,
`railroad-peg-beta`). v12's structure, class names and order are kept: per rule a
`g.railroad-rule` translated to its place, holding the definition's `g` (translated to where the
definition starts) with the expression groups `g.railroad-terminal`, `g.railroad-nonterminal`,
`g.railroad-special`, `g.railroad-sequence`, `g.railroad-choice`, `g.railroad-optional` and
`g.railroad-repetition` nested inside it (each child translated within its parent, written in
v12's order: a sequence's elements each followed by the connector to the next, a choice's
branches each followed by its left and right `path.railroad-line`, an optional's or a
repetition's element followed by its paths), then `g.railroad-rule-name-group >
text.railroad-rule-name`, `g.railroad-start > circle`, `g.railroad-end > circle` and the lead-in
and lead-out `path.railroad-line`, so selectors that use them keep working. Every position is
v12's, apart from the two layout fixes of D514.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="railroad-diagram"`, `role="graphics-document document"`, a `<style>` scoped by the id that coloured and sized `.railroad-terminal`, `.railroad-nonterminal`, `.railroad-special`, `.railroad-line`, `.railroad-start`/`.railroad-end` and `.railroad-rule-name` | No root `id`; `class="mermaid mermaid-railroad railroad-diagram"`, `role="img"`, `aria-roledescription` the diagram type (`railroad`, `railroadEbnf`, `railroadAbnf`, `railroadPeg`), `data-mermaid-version`. Paints are presentation attributes: each `rect` carries its `fill` and `stroke` (and a special's `stroke-dasharray="5,3"`, a terminal's `rx`/`ry`), each `text` its `fill`, each `circle` its `fill`, each `path.railroad-line` `fill="none"` and its `stroke`; a colour the `railroad` config sets is written as it is, any other reads a `var(--_x)` alias on the root `style`, which a host can re-theme with `--mermaid-railroadTerminalFill` and the other ten railroad variables. What every element shares is written once on the root and inherited: `font-family`, `font-size` and `stroke-width`; the font family and size are the theme's `var(--_x)` aliases (so `--mermaid-fontFamily` and `--mermaid-fontSize` reach them) unless the `railroad` config sets them. No `<style>`, except under `theme: 'auto'`: core's light/dark sheet, scoped by `data-p` on the root, as for every type | Inert output (R-SEC-2), no colliding ids (R-A11Y-1), host re-theming with `--mermaid-*` (R-THEME-3) |
| A box's text centred by the CSS (`text-anchor: middle`, `dominant-baseline: middle`); the rule name bold by the CSS (`font-weight: bold`) | The same values as attributes on each `text`: `text-anchor="middle"` and `dominant-baseline="middle"` on a box's text, `font-weight="bold"` on `text.railroad-rule-name` | No style sheet (R-SEC-2) |
| The CSS rules `.railroad-comment` and `.railroad-group` (which matched nothing: v12 drew no comment or group element) | Gone | Nothing drawn |
| No source mapping | Each `g.railroad-rule` carries `data-id` and `data-ast` `"rule:<name>"` (`rule:<name>@2` for a rule defined again) and each expression `g` both as `"<rule id>/<path>"` (the definition is `rule:a/0`, its second child `rule:a/0/1`); each `text` carries only the `data-id` of the rule or expression it labels (`text.railroad-rule-name` its rule's, `rule:<name>`). The definition's wrapping `g`, `g.railroad-rule-name-group`, the markers and the lines carry nothing | One `data-ast` element per AST node (R-PARSE-8, D517, pitfall 12) |
| Path data and transforms as v12's `PathBuilder` and d3 wrote them: `M 0 40 A 10 10 0 0 0 10 30 L 10 28`, `translate(74, 0)`, numbers in full | The same commands and points in core's writer format: `M0,40A10,10 0 0,0 10,30L10,28`, `translate(74,0)`, numbers rounded to two decimals; the root `style` as `max-width:<w>px` | Core's SVG writer (R-SEC-2) |
| `viewBox="0 0 <width> <height>"`: v12's canvas, which clipped a rule name in a font taller than its rule | The same unless something runs past it: the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover everything drawn, half the stroke included, and may start above 0 | D224 |
| The `title` statement and front-matter `title` stored, never drawn; `accTitle`/`accDescr` as `<title>`/`<desc>` with ids from the render id | The `title` still not drawn (D218); `accTitle` and `accDescr` as `<title id="<id>-title">` and `<desc id="<id>-desc">`, the only ids in the SVG, named by `aria-labelledby`/`aria-describedby` | R-A11Y-1 |
| A `railroad` colour, font family or font size that failed v12's checks fell back to the theme's silently; a length that was no number of 0 or more fell back to its default silently; a length or font size of any finite size was drawn (`1e308` broke the drawing) | The same fallbacks, and a length or font size of 10000 or more falls back too, with one `RAILROAD_CONFIG_INVALID` warning naming every dropped key. A misspelt colour (`redd`), which v12's check let through, falls back too (D690). A string length is still read with `parseFloat`, as v12 read it (`"12px"` is 12) | D515 |
| Colours from `buildThemeDefaults`: each from a shared theme variable, the terminal fill from `secondBkg` over theme-default's variables (`#ffffde` in base, neo, redux and redux-color, which have none) | The same sources through railroad's own variables (`railroadTerminalFill` … `railroadRuleNameColor`, nested as `themeVariables.railroad.<v12 key>`, which now reach the drawing too); the terminal fill is 12.2.0's in all eleven themes. Where v13 core resolves a shared variable (`secondaryBorderColor`, `secondaryTextColor`, `primaryBorderColor`, `tertiaryBorderColor`, `titleColor`) differently from v12, railroad follows core's value, as v12 followed its own | D516, D541 |
| `neo` and the redux themes: the same railroad as the classic themes | The same: railroad differs between families by colour and font only, with no gradient, shadow or hand-drawn outline | D227, D301 |

## Requirement diagram

- **Detection:** `requirementDiagram` and v12's bare `requirement` are detected by v12's
  case-sensitive detector with no word boundary (`/^\s*requirement(Diagram)?/`), between `pie`
  and `sequence` as in v12. So `requirementsx` is detected and then rejected as a syntax error
  (`SYNTAX`), and `RequirementDiagram` is not detected (`UNSUPPORTED_DIAGRAM`), as in v12. The
  language service, CodeMirror and Monaco know it.
- **Syntax** is v12's: a differential test runs v12 and v13 over every e2e fixture, the v12
  spec strings and docs examples, and the grammar is in
  [syntax/requirement.md](./syntax/requirement.md). Every error is reported, not only the first,
  with a range at the token (R-PARSE-4).
- **Label text** (D564, D610, #763, #836): names, the `text:`, `type:` and `docref:` rows and
  the other box rows read bold and italic, as in v12. A value that starts with `- `, `* ` or
  `+ ` is drawn as written. A code span is drawn as written, backticks included:
  `` "`**bold**`" `` draws `` `**bold**` ``, and bold and italic outside the span are still
  read. A requirement diagram has no markdown strings.
- **Trailing blanks** (D431): blanks before a line end are dropped, so the five places where
  v12 rejected them (after the header, after `{`, after a keyword value, after a quoted value)
  now accept. The six forms v12 accepted only because a blank swallowed the next line break
  (`requirement ⏎ a {`, `a - traces ⏎-> b`, …) keep v12's model.
- **`direction`** (D432) is a statement only at the start of a line, and the rest of the line
  is read as usual: `a - traces -> b direction LR` is a relation to `b direction LR`, which v12
  dropped silently. Text after a line-start direction (`direction LR;`,
  `direction LR a - traces -> b`) is now one syntax error, where v12 dropped the rest of the
  line.
- **Order-dependent styling** (D433) is kept: a `style`, `class` or `:::` before its box is
  defined is lost, `style` stops at its first unknown name and `classDef default` reaches the
  boxes defined before it only, as in v12. One `REQUIREMENT_STYLE_DROPPED` warning per render
  lists each lost statement (`related`, `astIds`). Style copies are capped at 1,000,000: past
  that the render fails with `MermaidError` `code: 'LIMIT'`, `limit: 'maxLayoutWork'`
  (R-SEC-5).
- **Unknown ends, duplicates and shared names** (D434): a relation to a name no box has stays
  in the model and is not drawn, with one `REQUIREMENT_UNKNOWN_NODE` warning; of duplicate
  definitions the first is kept, with one `REQUIREMENT_DUPLICATE` warning; a requirement and an
  element of one name are two boxes, relations and styles reaching the requirement first (v12's
  order), with one `REQUIREMENT_SHARED_NAME` warning. v12 warned about none of them.
- **Theme variables** (D435): `requirementBackground`, `requirementBorderColor`,
  `requirementBorderSize`, `requirementTextColor` and `relationLabelBackground`, which v12
  documented and never read, now take effect, with `relationColor` and `relationLabelColor`
  added; unset, they draw v12's colours, but for the label tag's fill, which is the theme
  background in every theme (D628; v12's redux chip was white, dark `#16141f`), so it follows an
  author's `background`, where v12's kept its own fill or followed `secondaryColor`. The label
  ink is chosen against that fill (D713): `textColor` where it meets AA, else black or white,
  whichever reads better, so a light `background` under a dark theme gets dark label text. Its
  base is `textColor`, not v12's `nodeTextColor`, so redux-dark, redux-dark-color and neo-dark
  write their labels in `#cccccc` where v12 wrote `#e0dfdf`, and an author's `nodeTextColor` no
  longer colours them. The tag also has diagram-level
  names, `requirementEdgeLabelBackground` and `requirementEdgeLabelColor` (D715);
  `relationLabelBackground` and `relationLabelColor` read them and, when set, win. The box fill
  and text follow the overrides v12's drawn box and text follow (`mainBkg`, the text ink), not
  those of v12's unused `requirementBackground` and `requirementTextColor`. See
  [theme-variables.md](./theme-variables.md).
- **Boxes** (D436) keep v12's one-column `Key: value` text with no wrapping. A multi-line value
  (a quoted text spanning lines) is stacked line under line, where v12 overlapped it with the
  line above, and a font whose half line passes the 20px padding no longer draws text above
  the box (its top is clamped). Body lines are left-aligned 10px in under every engine, where
  v12 with dagre centred them.
- **Config.** The `requirement` section is honoured: `theme` (default `redux-color`, as v12),
  `layout` (no requirement default: the top-level `layout`, `layered`) and `useMaxWidth`. v12's
  renderer read `state.useMaxWidth`, `state.nodeSpacing`, `state.rankSpacing` and
  `state.titleTopMargin` instead (a v12 bug): v13 reads `requirement.useMaxWidth`, and the
  spacing (50 by 50) and title margin (25) are fixed, v12's defaults; a `state.*` key no longer
  changes a requirement diagram. `useWidth`, `rect_fill`, `text_color`, `rect_border_size`,
  `rect_border_color`, `rect_min_width`, `rect_min_height`, `fontSize`, `rect_padding` and
  `line_height` are accepted and ignored, as v12.2.0's renderer never read them (see the
  ignored-keys table); `look` as everywhere (D153).
- **Edges** follow `requirement.curve`, then the top-level `curve`, then `rounded` (D733, #1378),
  a self-loop always `rounded`; `flowchart.curve` no longer reaches a requirement diagram, as v12
  drew its edges with it. The layout keeps room for each marker so it no longer overlaps the next box.
- **Several self-loops on one box** (D618, #768) each get their own route: the second is drawn
  on the opposite side of the box and later ones nest outward, alternating sides, so every line
  and label shows, as v12 drew them side by side. Before, they were drawn over one another. A
  single self-loop is unchanged.
- **Text output** (`format: 'ascii'`) is new (#588, D320, D438): see
  [ASCII output](../ascii.md#requirement-diagrams).
- **Hand-drawn:** the diagram is sketched under `look: handDrawn`: the box outline, the divider
  and the relation lines (markers are never sketched, D301).
- **Limits** (R-SEC-5, D608): a diagram may have up to `limits.maxNodes` requirements and
  elements together (10,000) and `limits.maxEdges` relationships (5,000); a repeated
  definition is not a new box. Over either, render rejects with a `LIMIT` `MermaidError`. v12
  had no such limit. Only the integrator can raise them ([Limits](#limits)).

## Requirement SVG structure

What changed in the requirement diagram's SVG compared with v12 (DESIGN §7.2, spec #520 T4,
#574). The groups are v12's unified render's (`edgePaths`, `edgeLabels`, `nodes`), and v12's
class names are kept where the element still exists (`node default <classDef>`, `basic
label-container outer-path`, `divider`, `relationshipLine`, `edge-thickness-normal`,
`edge-pattern-solid`/`-dashed`, `edgeLabel`, `requirementDiagramTitleText`).

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `class="requirementDiagram"`, `aria-roledescription="requirement"`, a `<style>` element | No root `id`; `class="mermaid mermaid-requirement requirementDiagram"`, `role="img"`, `aria-roledescription="requirement"`, `data-mermaid-version`; no `<style>`, colours are presentation attributes reading `var(--_x)` aliases | Only `<id>-title` and `<id>-desc` ids, and the neo gradient's (D182, R-A11Y-1); inert output (R-SEC-2) |
| Box `<g class="node default …" id="<render id>-<name>" data-look>` | `<g class="node default …" data-id="<name>" data-ast="requirement:<name>"\|"element:<name>" data-color-id transform>` | `data-ast` maps the box to its definition (D437, R-PARSE-8); `look` is removed (D153) |
| Outline as rough.js paths in `<g class="basic label-container outer-path">` (a fill path and a stroke path) | One `<rect class="basic label-container outer-path">` (through the outline hook: a sketch under `look: handDrawn`) | One element per outline (D302) |
| Each line a `<g class="label">` holding a `<foreignObject>` (or `<text>`), `<<Kind>>` and the name centred, the body centred under dagre and left-aligned under ELK | One `<text class="label kind\|name\|id\|text\|risk\|verification\|type\|docRef">` per line; the body left-aligned 10px in under every engine, a multi-line value stacked line under line | Text labels only (D5); GAPS #570 |
| Divider `<g class="divider">` with a rough.js line (neo: a 0.001-tall polygon) | `<g class="divider">` with one `<path>`: the rule alone, its right end lifted 0.01 under the neo gradient so the gradient paints it | D185, as class's dividers; the outline is sketched once under `look: handDrawn` |
| Relation `<path class="edge-thickness-normal edge-pattern-dashed\|solid relationshipLine" id="<render id>-<src>-<dst>-<n>" data-id="<src>-<dst>-<n>" marker-start\|marker-end>`, `<marker>` elements in `<defs>` | `<path class="edge-thickness-normal edge-pattern-dashed\|solid relationshipLine" data-id="<src>-<dst>-<n>" data-ast="relation:<src>-><dst>">` and its marker beside it: `<path class="marker requirement_arrow">` (the chevron's two strokes) at the target, or `<g class="marker requirement_contains">` (a `<circle>` and the plus `<path>`) at the source | No `<defs>` or ids (D35); markers are never sketched (D301) |
| A relation to a name no box has: an edge with an undefined end | Not drawn; its `<n>` still counts it | D434 |
| `look: neo`: 2px lines, the chevron at 0.8 in user space, marker strokes and box outline at `strokeWidth`, the gradient on the outline and divider, the drop shadow on the outline | The same, by theme family: the redux and neo themes draw it, the classic themes draw v12 classic (1px lines, a 20 × 20 chevron and r 9 circle with 1px strokes, a 1.3px outline, no shadow). The geometry is `relationStrokeWidth` (lines and marker strokes), `relationArrowScale` and `requirementBorderSize` | D152, D153, D227 |
| Marker room: none (dagre); markers could overlap the next box | The layout keeps each marker's drawn extent clear, from the theme's marker geometry (21 × 21 classic, 20 × 20 redux and neo, more for a wider `strokeWidth`; marker strokes stop at 8px, the chevron scale at 2) | Spec #520 (marker room from the family tokens) |
| Edge label `<g class="edgeLabel">` with `<foreignObject>` (`div.labelBkg`, `span.edgeLabel`) | `<g class="edgeLabel" data-id>` with a `<rect>` and a `<text>` | Text labels; labels carry no `data-ast` (D437) |
| Relation label on a square chip with no border (`relationLabelBackground`, white or `#16141f` in the redux themes) | A tag, the shared edge label: a rounded box (`rx` 6, no `labelBkg` class) with 8 px of room each side and 4 px above and below, filled opaque with `relationLabelBackground` (the theme background unless set, in every theme) and bordered 1 px solid in `relationColor`, solid on the dashed lines. The layout reserves the same box (`labelPatch`). Under `look: handDrawn` the border is sketched | D626, D627, D628, D629, D630 |
| Edges drawn with `flowchart.curve` (`rounded` by default) | The same curves, through the new `requirement.curve`, then the new top-level `curve`, then `rounded`. `flowchart.curve` is not read: a requirement diagram that set it sets `requirement.curve` instead. Nothing set draws as before. Text output stays stepped and warns `ASCII_DROPPED` for a curve set by either key | One key per type (D733, #1378) |
| A self-loop drawn with `flowchart.curve` | A self-loop is always `rounded`, whatever the curve | Class's precedent: its legs are too short for the other curves |
| A `style` / `classDef` `fill` left the text in the theme's ink (`styles2String` sends only `color` and `font-*` to the labels) | A `fill` with no `color` gives the text `theme.ink(fill)`, an ink that reads on it | R-THEME-12, ER's precedent |
| Palette colours by CSS `[data-color-id].node path` rules | `data-color-id` kept; the colours are attributes on the outline and divider; an author `style` still wins | D152 |
| Front-matter `title` as `<text class="requirementDiagramTitleText" y="-25">` | `<text class="requirementDiagramTitleText">` centred over the drawing, its baseline 25px above the layout's top, in `textColor`; the viewBox grows to hold it | D218 |
| Five documented theme variables (`requirementBackground`, `…BorderColor`, `…BorderSize`, `…TextColor`, `relationLabelBackground`) drew nothing | They, `relationColor` and `relationLabelColor` paint the boxes, text, lines, markers and label chips, with v12's drawn values by default | D435 |

## State diagram

- **A comma inside a `style` or `classDef` value** (D706, #1312): `fill:rgb(255, 200, 200)`,
  `stroke:hsl(210, 60%, 40%)` and `font-family:Georgia, "Times New Roman", serif` keep the
  whole value. v12 split the statement at every comma, so the colour was lost and the font list
  kept only its first name, without a warning.
- **Label text** (D564, D610, #763, #836): state text, composite titles, transition text and
  notes read bold and italic, as in v12. A label that starts with `- `, `* ` or `+ ` is drawn
  as written: no bullet. A code span is drawn as written, backticks included and no monospace,
  and bold and italic outside it are still read. The title and rows of a state with several
  description lines are plain text, as v12 drew them: `**x**` stays as written there and a
  written `\n` breaks the line.
- **A described state is not wrapped** (D731, #1214): the title and the description rows of a
  state with several description lines break only at a written `\n`, never at
  `state.wrappingWidth`, and the box grows to the longest line. This holds in cells too. v12 built
  these labels with an infinite width. A state with one description wraps as before.
- **Room below a composite's title** (D732, #1301, #1307): the first state or start dot in a
  titled composite sits 20 px below the line under the title, the same room as on the other
  three sides, at every nesting level. v12 left about 8 to 12 px there. The concurrency regions
  of a composite start at that line, so their dividers run from it to the bottom border. Titled
  composites are 16 px taller than before; the title keeps its place in the strip.
- **Transition curves** (D733, #1324, #1325): `state.curve` sets how transitions and note
  connectors are drawn, then the top-level `curve`, then `curved`, today's look, so a diagram
  that sets neither draws as before. `flowchart.curve` no longer changes state diagrams: v12's
  shared edge renderer fell back to it, v13 does not, so a v12 author who set it for state
  edges sets `state.curve` or `curve` instead. A self-transition stays `rounded`, and text
  output stays stepped. A name outside the list is drawn `rounded` and warns `CURVE_UNKNOWN`
  once per render.
- **A transition written inside a composite that names the composite** (D555):
  `state Boot { Running; Boot --> Running }`, the reverse, and `Outer --> Inner` written inside
  `Inner`. v12 filed the composite under itself (or under a state inside it) and then never
  returned under the ELK layouts, or threw. v13 keeps the composite where it was declared and
  draws the transition, with every layout.
- **Limits** (R-SEC-5, D608): a state diagram may have up to `limits.maxNodes` states (10,000)
  and `limits.maxEdges` transitions (5,000). Start and end dots, forks, joins, choices and
  composite states count as states; concurrency regions and notes do not. Over either, render
  rejects with a `LIMIT` `MermaidError`. v12 had no such limit. Only the integrator can raise
  them ([Limits](#limits)).
- **Transition labels are tags** (D626–D630): a rounded box (`rx` 6) with 8 px of room each
  side and 4 px above and below, filled opaque with `edgeLabelBackground` (the theme background
  unless set) and bordered 1 px solid in the transitions' line colour. v12 drew the label on a
  half-transparent fill with no border. Transitions reserve the matching room, so diagrams with
  labels grow a little. Under `look: handDrawn` the border is sketched.

## Tree view

The tree view parser accepts the v12 language, `treeView-beta`, box-drawn input (`├──`, `└──`,
`│`, and the heavy `┣━━` set) included (oracle parity over every e2e fixture, the v12 spec
strings and the syntax page; grammar in [syntax/treeview.md](./syntax/treeview.md)). The rows,
indents, connectors, descriptions, highlights and v12's `/` root row are v12's (spec #518). What
changes:

| v12 | v13 | Why |
| --- | --- | --- |
| Syntax errors: Langium's first message, naming tokens; in box-drawn input at the line and column of v12's rewritten text | Every error, in words, at its source line and column, box-drawn lines included. The traps v12 has are kept, each with its own warning: two nodes on one line (`TREEVIEW_NODES_ON_ONE_LINE`), a trailing blank that indents the next node (`TREEVIEW_TRAILING_BLANK`), an annotation on the line after its node (`TREEVIEW_ANNOTATION_NEXT_LINE`), a first node read as a title (`TREEVIEW_NAME_READ_AS_TITLE`) | D486 |
| v12 drew a connector into the root row `/`, from `-rowIndent` to 0, outside its `viewBox` | The `/` row is kept; that connector is gone | D482 |
| The `viewBox` cut the right edge by half a line width, and a highlight could reach past it | The `viewBox` is v12's, grown wherever something drawn reaches past it | D224 |
| The diagram title (`title …` or front matter) was kept and not drawn | The same: kept in the model, not drawn. Names and descriptions are plain text with their blank runs: `<br>`, `$$` and `fa:` in a name print as written. Entity codes are decoded, as in v12: `#35;`, `#quot;` and `#9731;` draw `#`, `"` and `☃`, in the SVG and in text output. A reference typed with `&` (`&amp;`) is decoded too; v12 showed it as written | D484, D218, D563 |
| The built-in `file` and `folder` icons came from a `mermaid-treeview` Iconify pack that v12 registered | treeView draws them itself and registers no pack: `registerIconPacks` code that reads `mermaid-treeview` finds none. Other icons (`icon(pack:name)`, `defaultIconPack`, the icon maps) come from an icons extension (`@mermaid-js/plugin-icons`); one that is not drawn gets v12's unknown-icon glyph, a blue `?` square, in its slot, as in v12, with one `ICON_NOT_RENDERED` warning naming it, and the slot stays empty only while its pack loads | D485, D290, D299, D702 |
| Under `showIcons`, a file named `constructor`, `toString` or `a.constructor` (any name on `Object.prototype`) looked its icon up through the prototype and drew a broken icon; `icon(constructor)` with a `defaultIconPack` was `mermaid-treeview:constructor` | Own-property lookups: such a file draws its default icon, and `icon(constructor)` is `<defaultIconPack>:constructor` | D486 |
| A `treeView` config value of the wrong type or a negative length was used as given: `rowIndent: "20"` with `paddingX` 5 indented each level by `"205"`, 205 px | A length is a number, or a numeric string as its number, of 0 or more; a `defaultIconPack` a string; an icon map an object. Anything else draws with the default and one `TREEVIEW_CONFIG_INVALID` warning per key | D226 |
| Every `:::highlight` row widened the diagram by 10 px and made each later highlight box 10 px wider than the one before | The same: kept for parity | |
| `themeVariables.treeView.labelFontSize` in `em` or `pt` (`1em`, `12pt`) sized the labels through CSS | Only px or a bare number: another unit is dropped with `THEME_VARIABLE_DROPPED` (naming the flat `treeViewLabelFontSize`) and the labels stay 16 px | Core's theme `length` kind takes px only (`16px` or a bare number), and the layout measures in px; a unit-aware kind would change every diagram's size variables. Needs a D-id |
| `themeVariables.treeView.*`: v12's styles read seven keys | The same keys set `treeViewLabelFontSize`, `treeViewLabelColor`, `treeViewLineColor`, `treeViewIconColor`, `treeViewDescriptionColor`, `treeViewHighlightBg` and `treeViewHighlightStroke`, key by key; each is also a flat theme variable, and the flat name wins when both are set | D335, D540 |
| `look: handDrawn` (top level or `treeView.look`): v12 never sketched a tree view | Without `@mermaid-js/plugin-hand-drawn`, `look` is ignored with one `LOOK_REMOVED` warning, as in every section. With the plugin, `look: handDrawn` turns `handDrawn` on with no warning, and the tree view draws exactly as without it: not sketched | D301, D303 |
| `format: 'ascii'`: no text output | Text output from `@mermaid-js/diagram-treeview/ascii` (loaded only for a text render): `tree(1)` style from the first real row, no `/` row; `├── `, `└── `, `│   ` (`|-- `, `` `-- ``, `|   ` with `ascii.charset: 'ascii'`); directories keep their `/`; descriptions in one aligned column; icons dropped with one `ASCII_DROPPED`; a highlighted row marked `▶` (`>`) in a one-cell gutter; `ascii.padding: roomy` puts a line between rows | D488, D320 |

### Tree view theme colours

v12 drew its seven literals in every theme: black label ink and connectors, `#546e7a` icons,
`#6a9955` descriptions, a `rgba(255, 193, 7, 0.15)` highlight fill with a `#ffc107` stroke, at
16 px. v13 keeps them in every light theme and in `base` with `darkMode` (the colours follow the
theme's dark trait, as v12 never varied them by `darkMode`). In the four dark themes the label
ink and the connectors follow the theme, and the icons take blue grey 300, the dark counterpart
of `#546e7a`; the description green and the highlight read on both and stay
(`packages/conformance/src/treeView/theme.spec.ts` lists each difference):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `dark` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |
| `redux-dark` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |
| `redux-dark-color` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |
| `neo-dark` | Black labels and connectors and `#546e7a` icons on the dark background | Labels in the theme's `textColor`, connectors in its `lineColor`, icons `#90a4ae` | D483 |

### Tree view SVG structure

What changed in the tree view's SVG compared with v12 (spec #518, DESIGN §7.2). v12's class names
are kept (`tree-view`, `treeView-highlight-bg`, `treeView-node-icon`, `treeView-node-label`,
`treeView-node-dir`, the author's `:::class`, `treeView-node-description`, `treeView-node-line`),
and so are the rows, the connectors and the draw order.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, `role="graphics-document document"`, `aria-roledescription="treeView"` | No root `id`; `class="mermaid mermaid-treeView"`, `role="img"`, `aria-roledescription="treeView"`, `data-mermaid-version`, `font-family`; `<title>` and `<desc>` (accTitle, accDescr) with ids `<id>-title`, `<id>-desc` | R-SEC-2, R-A11Y-1 |
| A `<style>` scoped by the id: the `.treeView-*` rules gave the fills, sizes, weights and strokes, and `white-space: pre` | No `<style>` (except under `theme: 'auto'`, core's light/dark sheet): presentation attributes on each element: `fill` and `font-size` on labels and descriptions, `font-weight="bold"` on directories, `font-style="italic"` on descriptions, `stroke` and `stroke-width` on connectors and highlight boxes, `color` on the icon group, `xml:space="preserve"` for the blank runs; colours read `var(--_x)` aliases on the root `style` | Inert output (R-SEC-2), host re-theming with `--mermaid-*` (R-THEME-3) |
| Each icon a nested `<svg>` from `getIconSVG` inside `g.treeView-node-icon` | `g.treeView-node-icon` (still `translate(x + paddingX, y + paddingY)`) holds a `<path>`: the built-in `file` or `folder` glyph, or the icons extension's glyph; no nested `<svg>`. An icon that is not drawn holds v12's unknown-icon glyph, a `<g>` with the blue `<rect>` and the `?` `<text>`, scaled from its 80 px square; the slot is empty only while the icon's pack loads | D485, D293, D702 |
| No source mapping | Each node's row `g` carries `data-ast` (`node:<dir>/<dir>/<name>`, `@2` for a repeat in one directory) and `data-id`; its highlight box, icon, label, description and connectors carry `data-id` only. The `/` root row carries neither | R-PARSE-8, D487 |
| The connector into the root row, outside the `viewBox` | Gone | D482 |
| Dark themes drew the light literals | The D483 colours ([above](#tree-view-theme-colours)) | D483 |
| `look: neo` and the redux themes: the same tree view as the classic themes | The same: the tree view differs between families by colour only | D227 |

## Usecase diagram

The usecase parser accepts the v12 language (`usecase-beta`; a differential test runs v12's own
lexer and parser over every e2e fixture, the v12 spec strings and the docs examples, and the
grammar is in [syntax/usecase.md](./syntax/usecase.md)). `usecase-beta` is detected by v12's
case-sensitive detector (`/^\s*usecase-beta(?:\s|$)/`), last, as in v12; it was
`UNSUPPORTED_DIAGRAM` before the port. The language service, CodeMirror and Monaco know it. What
changes (spec #517):

| v12 | v13 | Why |
| --- | --- | --- |
| Laid out with the top-level `layout`, whose 12.2.0 default is `elk` | Laid out with `layered` unless `layout` (or `usecase.layout`) names another engine: `dagre` draws with `layered`, `compass` takes its sides from `direction`, `elk` and `elk.<algorithm>` need `@mermaid-js/layout-elk` and without it draw with `layered` and one `ELK_NOT_INSTALLED` warning. Positions are not ELK's | R-LAYOUT-7, D127, D173, D327 |
| `actorFontFamily` and `usecaseFontFamily` defaulted to `"Open Sans", sans-serif` | Unset, both are the theme's `fontFamily`, as every other label; a set value takes effect | D132 |
| The first error stopped the parse: Chevrotain's lexer and parser messages (naming tokens and rules), V8's `JSON.parse` text, or the model builder's message with `at line L, column C [s,e)` | Every error is reported, with a range. Model errors (conflicting kinds, labels or shapes, unresolved targets, invalid relations, metadata or JSON, duplicate ids, …) keep v12's message without the location suffix, and the diagram is still rejected; lexer, parser and JSON errors have v13's own messages. v12's first error is among v13's at the same offset | D473, R-PARSE-4 |
| `usecase-beta` then an unclosed `%%{` line: v12's directive regex removed the line and the diagram drew | Rejected with `UNCLOSED_DIRECTIVE` (core's preprocess, as for every type) | Core preprocess; parity lists it (`directive-unclosed`) |
| `#name;` codes: v12 drew them from the browser's full HTML table (`#mp;` as ∓) | Codes outside core's entity table draw as written (`#mp;`, D561; before it `&mp;`); core's names (`#amp;`, `#quot;`, `#copy;`, …) and every numeric code still draw their character | Core's table (R-PERF-8); parity lists it (`entities-outside-core`) |
| The front-matter `title` was never drawn (`db.clear()` wiped it) | Drawn above the diagram ([Usecase SVG structure](#usecase-svg-structure)) | D472, D133 |
| `data-usecase-id`, `data-usecase-kind` and a DOM id `usecase-<id>` on each element | `data-ast` (AST ids `actor:A`, `usecase:B`, `boundary:S`, `note:1`, `json:P`, `rel:e1` or `rel:A->B`, `@2` for a repeat) and `data-id`; `role`, `aria-label` and `aria-hidden` kept ([Usecase SVG structure](#usecase-svg-structure)) | D475 |
| The DB's `getAST()`: a source-span AST of statements | Not ported. The parse result's AST (`parseUsecase(text).ast`, DESIGN §4.2) and the language facet (`@mermaid-js/diagram-usecase/language`) carry the statements, ids and symbols | D476 |
| Plain labels, stereotypes, JSON cells, edge labels and the title were escaped (`&`, `<`, `>`) before drawing | The same: their markup is text; only Markdown labels read the HTML subset | D225, R-SEC-2 |
| A word wider than `wrappingWidth` stayed whole in its HTML label, and the shape grew to hold it | The same: it stays whole on a line of its own and the shape grows (earlier v13 builds split it between characters; the text output still does, to keep it in its box) | #649 |
| Actor names in `actorTextColor` (the sequence diagram's variable) | `primaryTextColor`, as use case labels; differs in `default`, `dark`, `forest` and `neutral` ([Usecase theme colours](#usecase-theme-colours)) | D474 |
| The boundary greys `usecaseBoundaryBkg` / `usecaseBoundaryBorder` of `redux-color` (`#FAFAFC` / `#BDBCCC`) | `clusterBkg` / `clusterBorder`, never painted in the colour themes: each boundary takes its palette slot there, in v12 too ([Usecase theme colours](#usecase-theme-colours)) | D474, D541 |
| A `usecase` length, font or `colorScheme` of the wrong type reached the renderer as it was (`wrappingWidth: "wide"`, `actorFontSize: -1`) | A length is a number or a numeric string, from the schema's minimum up to 10000; a weight one of the schema's; a family one the style check allows; `colorScheme` `role` or `rotate`. Anything else draws with the default and one `USECASE_CONFIG_IGNORED` warning per key | Pitfall 22 |
| A styled `font-size` (`classDef`, `style`) in `vw`, `vh`, `0` or 10000px and up was drawn as given | Measured and drawn at the element's default size, with one `USECASE_STYLE_IGNORED` warning per value: the layout measures every label before drawing it | Pitfalls 16, 22 |
| `usecase.theme` (default `redux-color`) chose the theme when no other layer set one | The same: honoured with v12's default; a `theme` from `initialize()` or the text wins over it, and `usecase.theme` over the top-level `theme` within a layer | P2 |
| Relationship and note lines were always drawn as one fixed curve; no curve key | Unset, the same S-curves. The new `usecase.curve`, then the new top-level `curve`, set them with `flowchart.curve`'s names (`linear`, `step`, `rounded`, …), and the layout routes the lines to match; a line from a node to itself stays rounded, and text output keeps its right angles and warns `ASCII_DROPPED` (curve) once when a curve is set (D760). An unknown name draws `rounded` with one `CURVE_UNKNOWN` warning | D733, D760 |
| No text output | `format: 'ascii'` draws the diagram as text ([ASCII output](ascii.md#usecase-diagrams)): actors as a figure, use cases as `( label )`, boundaries as frames | D320, D478 |

## Usecase SVG structure

What changed in the usecase diagram's SVG compared with v12 (spec #517). v12's classes and draw
order are kept: `g.clusters` (each `g.usecase-system-boundary.system-boundary-<type>` with its
`rect.boundary-body`, a package's `rect.boundary-tab` and `g.system-boundary-title`), then
`g.edgePaths` (each `g.relationship.relationship-<type>`), `g.edgeLabels` and `g.nodes` (actors
`g.usecase-actor.usecase-actor-<type>` with `g.usecase-actor-glyph`, use cases
`g.usecase-element.usecase-ellipse|usecase-rect`, `usecase-business`, `g.usecase-note`,
`g.usecase-json-table`), with the author's `:::`/`class` names and `edge-animation-fast|slow`.

| v12 | v13 | Why |
| --- | --- | --- |
| Root `id="<render id>"`, a `<style>` scoped by the id holding the role colours, the palette slot rules and the fonts as `--mermaid-usecase-*` custom properties | No root `id`; `class="mermaid mermaid-usecase"`, `role="img"`, `aria-roledescription="usecase"`, `data-mermaid-version`. No `<style>` (except `theme: 'auto'`'s variables-only sheet): fills, strokes, widths and fonts are presentation attributes, colours reading `var(--_x)` aliases on the root `style` | R-SEC-2, R-THEME-3 |
| An unscoped DOM id `usecase-<id>` on each element, an id on each relationship path, `data-usecase-id` and `data-usecase-kind` | No ids but `<prefix>-title` and `<prefix>-desc`. `data-ast` (the AST id: `actor:A`, `usecase:B`, `boundary:S`, `note:1`, `json:P`, `rel:e1` or `rel:A->B`) on each element's and relationship's group, `data-id` (the model id: `A`, `note-0`, `edge-0`, `note-0-edge`) on it and on its parts; the kind is the group's class | D475, R-PARSE-8 |
| `role="img"` and an `aria-label` on each element; on each relationship path `role="img"` and an `aria-label`, `aria-hidden="true"` on a note's connector | The same names and attributes (`business hollow actor Customer, stereotype Human`, `include from Login to Pay`), the element's on its group, a relationship's on its line | D475 |
| Labels in `foreignObject` (HTML), and a stereotype folded into a use case's label as Markdown (`«s»<br/>label`) | SVG text laid out by core ([Labels and text](#labels-and-text)): `<br>`, entities, Markdown, math and icons work. A stereotype is a first `text.usecase-stereotype` line `«s»` above the label, for actors and use cases alike. A plain label's markup is still text, as v12 escaped it (`Hostile("<img …>")` draws the tag's text); only Markdown labels read the HTML subset | D225, R-SEC-2 |
| The front-matter `title` was set, then wiped by `db.clear()` before `insertTitle` ran: never drawn | Drawn above the diagram as `text.usecaseDiagramTitleText` in the root's text colour, centred, the drawing moved down by its height and the diagram padding; it does not name the diagram (`accTitle` does) | D472, D133 |
| `<defs>` with `<marker>` elements (`point`, `circle`, `cross`, `extension`) referenced by `marker-end` | Each marker is a `path.marker` in its relationship's group: v12's classic point, circle, cross and the generalization's hollow triangle (filled `mainBkg`), sized as v12's classic markers in every theme, in the line's colour (an author's `style` stroke included) | DESIGN §7.1, D227 |
| An invisible `rect.usecase-actor-outline` (`opacity: 0`) around each actor | Not written: the actor's group carries the name, the layout its box | Nothing invisible is drawn |
| Animated relationships: `stroke-dasharray: 9,5` and the `dash` keyframes | The same dashes, caps and speeds, moved by an `<animate>` in the relationship's group: the keyframes need a `<style>` | R-SEC-2, D606, as the flowchart |
| An icon actor drew Font Awesome's fallback glyph (`usecase-actor-icon-fallback`) for an unknown icon | The icons extension's glyph (D293) in the frame, else the frame alone with one `ICON_NOT_RENDERED` | D293, D299 |
| `look: neo` (the `usecase.look` default) was never read by the renderer, which took the global `look` (`classic`): no shadow, no gradient | The same in every theme: usecase differs between families by colour only | D227, D153 |
| Hand-drawn: roughjs sketched each shape, cell and frame (roughness 0.7, hachure, fill weight 1.5) and each line (roughness 0.3) | `@mermaid-js/plugin-hand-drawn` sketches each node shape (`node`), JSON cell (`part`), boundary frame and tab (`group`, fill weight 3), line (`edge`) and edge-label border (`label`, solid fill); markers, business marks and text stay plain | D301, D302, D630 |
| Relationship label on a `.labelBkg` background (`edgeLabelBackground`, 2 px each side, square, no border) | A tag, the shared edge label: `g.edgeLabel` > a rounded `rect` (`rx` 6, no `labelBkg` class) with 8 px of room each side and 4 px above and below, filled opaque with `edgeLabelBackground` (the theme background unless set) and bordered 1 px solid in the line's colour (an author's `style` stroke, else include's or extend's colour, else `lineColor`), solid on dashed lines; then `text.relationship-label`. The layout reserves the same box (`labelPatch`). The fill is `usecaseEdgeLabelBackground` (default `edgeLabelBackground`) and the ink `usecaseEdgeLabelColor` (default `textColor` where it reads on the fill, else black or white), not `primaryTextColor`: the ink differs in `default` (`#333333`, was `#131300`), `dark`, `redux-dark`, `redux-dark-color` and `neo-dark` (`#cccccc`, was `#e0dfdf`), `forest` (`#000000`, was `#321b67`) and `neutral` (`#000000`, was `#111111`). An author's `primaryTextColor` no longer colours relationship labels (set `usecaseEdgeLabelColor`); an author's `style` colour on the edge still wins | D626, D627, D628, D629, D713, D715 |

### Usecase theme colours

The eight role colours are the package's theme variables (`usecaseActorBkg`,
`usecaseActorBorder`, `usecaseBkg`, `usecaseBorder`, `usecaseBoundaryBkg`,
`usecaseBoundaryBorder`, `usecaseIncludeLine`, `usecaseExtendLine`), with v12's fallbacks. Where a
theme carries a palette, the six that `redux-color` takes from it (`borderColorArray` slots 5, 1,
10, 2, `bkgColorArray` slots 5, 1) read the palette's slot, so both colour themes match v12 and an
author's `borderColorArray` recolours them in any theme, where v12 kept the theme's (D474). With a
palette each system boundary takes its own slot under both colour schemes, and under
`usecase.colorScheme: rotate` actors then use cases take one shared counter, as in v12; notes and
JSON tables never do, and every counted element carries `data-color-id`. What changed
(`packages/conformance/src/usecase/theme.spec.ts` lists each one):

| Themes | v12 | v13 | Why |
| --- | --- | --- | --- |
| `redux-color` | `usecaseBoundaryBkg` `#FAFAFC` | `clusterBkg` (`#F9F9FB`). Never painted: each boundary takes its palette slot, in v12 too | D474, D541 |
| `default`, `dark`, `forest`, `neutral` | Actor names in `actorTextColor` (`black`, `lightgrey`, `black`, `#333`) | `primaryTextColor`, as use case labels: `actorTextColor` is the sequence diagram's own variable | No shared input (D474) |
| `base` | Actor, use case and boundary borders from v12 base's border step | v13 base's border step (`actorBorder`, `nodeBorder`, `clusterBorder`), as every diagram in that theme | Core theme |
| `neo-dark` | Boundary border `clusterBorder` derived with the light rules | Derived with the dark rules | D183 |
