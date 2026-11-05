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
   text ([Labels](#labels-and-text)).
3. Click callbacks (`click A callback`, `call fn()`) and `bindFunctions` need
   `@mermaid-js/plugin-interactions` ([Click callbacks](#click-callbacks-and-bindfunctions)).
4. `securityLevel: 'loose'` (and `antiscript`, `sandbox`) now means `default`; `strict` now
   allows relative links only ([securityLevel](#securitylevel)).
5. CSS that targets element ids, `<marker>`, `.label-container` or the `<style>` element inside
   the SVG must move to the kept class names and `--mermaid-*` CSS variables
   ([Flowchart SVG structure](#flowchart-svg-structure), [Themes](#themes)).
6. The default theme is `redux-color`, the theme v12's flowchart renders by default, and the
   default layout is `layered`; set `theme: 'default'` to keep v12's `default` colours and
   classic geometry ([Changed defaults](#changed-defaults), [Themes](#themes)).
7. `look` is ignored with a `LOOK_REMOVED` warning; neo and classic geometry now come with the
   theme ([Themes](#themes)).
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
| Node, SSR | Nothing. On first render `mermaid` scans the `node_modules` of the nearest `package.json` at or above `process.cwd()` (its top level and `@scope` folders, never parent folders). A package with a bad manifest, a path outside the package or a detector that takes over 5 s to import is skipped with a `PLUGIN_SKIPPED` warning in `RenderResult.warnings`. A server deployed without `node_modules` gets no warning | D165 |
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
| `run()`, `startOnLoad`, `contentLoaded()` | Same: `run()` renders every unprocessed `.mermaid` element (marking it `data-processed`), puts the error image in place of a failing one, carries on, and rejects with the first `MermaidError` at the end unless `suppressErrors`. `startOnLoad` runs it on `window` load. Diagram ids are `mermaid-<n>` from a counter (v12 used `Date.now()` unless `deterministicIds`). Elements inside a drawn `<svg>` are skipped, because v13's svg root has class `mermaid` | R-API-6, R-ERR-3 |
| — | New: `mount(el, text, { availableWidth?, config?, id? })` → `{ ready, result, error, update(text), destroy() }`. It re-renders when the element is resized only with `availableWidth: true`, re-measures after a web font loads, and needs no re-render on theme change (set `--mermaid-*` on a parent) | R-API-7, D33 |
| — | New: `renderSync(text, { availableWidth })` fits graph layouts to a width (R-LAYOUT-5) | R-LAYOUT-5 |
| `registerExternalDiagrams([{ id, detector, loader }])` where the loader returns a v12 `DiagramDefinition` (parser, db, D3 renderer) | Same call shape, but the loader returns a v13 diagram plugin `{ id, detector, parse, layout?, render }`. v12 diagram definitions do not run in v13 | D35, R-PLUG-2 |
| `registerLayoutLoaders([{ name, loader, algorithm? }])` where the loader returns a DOM renderer | `registerLayoutLoaders([{ name, loader }])` where the loader returns a layout engine `(graph, ctx?) → LayoutModel`; selected with `layout:` | R-LAYOUT-2 |
| `layout: elk` / `elk.<algorithm>` uses the ELK package | Laid out by `@mermaid-js/layout-elk` once registered (`mermaid.registerLayoutLoaders(elkLayouts)`, as in v12; it registers v12's seven names plus `elk.layered` and `elk.radial`); without it, drawn with the built-in `layered` engine and one `ELK_NOT_INSTALLED` warning naming the package | DESIGN §6.1, D171, D173 |
| `registerIconPacks([{ name, icons } \| { name, loader }])` | Same call shape and quirks (`name` overrides the pack's `prefix`; a loader may return the pack itself). Packs belong to one `mermaid` object (`createMermaid()`), not the page, and are drawn by `@mermaid-js/plugin-icons`. Loaders run in `prepare()`/`render()` only for a diagram that names their pack, or in the new `preload({ iconPacks })`; a rejecting loader no longer fails the render. See [Icons](#icons) | R-API-2, R-API-3, D290, D294, D299 |
| `setParseErrorHandler(fn)` gets the raw error | Deprecated; `fn` gets the `MermaidError` of a failed `parse()` | R-API-4 |
| `initialize()` replaces the site config | Same: it swaps in a new frozen defaults object; renders already started keep the old one | R-ARCH-4, D72 |
| Integrator options beyond the schema | `initialize()` also takes `measurer`, `deterministic`, `linkSchemes`, `output.cssVariables` and `limits`; diagram text can never set them | R-SEC-5, R-SEC-6 |
| Text over `maxTextSize` renders a "Maximum text size in diagram exceeded" placeholder diagram; over `maxEdges` throws an `Error` | Both reject with `MermaidError { code: 'LIMIT' }`, as do the new caps (see Limits) | R-SEC-5, D31 |
| `RenderResult.bindFunctions` is set when the diagram has click callbacks | Set only when `@mermaid-js/plugin-interactions` is installed | R-PLUG-9 |

### securityLevel

`securityLevel` has two levels (D48, D75). The new default, `default`, keeps `http`, `https`,
`mailto` and relative link URLs, which is what v12's default `strict` kept. **`strict` now keeps
relative links only**: an integrator who set `securityLevel: 'strict'` explicitly loses absolute
links and gets a `URL_REFUSED` warning per dropped link. Set `securityLevel: 'default'` (or
leave it unset) to keep them. `loose`, `antiscript` and `sandbox` act as `default` with a
`SECURITY_LEVEL` warning; there is no sandbox iframe mode and no HTML in labels.

In v12, `loose` was also what allowed click callbacks and HTML labels. In v13 neither depends on
`securityLevel`: HTML labels are gone, and callbacks depend on the interactions plugin. Only
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

With the plugin, callbacks work as in v12. In Node, or in a bundle built with
`@mermaid-js/bundler-plugin`, installing it is enough ([Plugins](#plugins-installed-is-enabled-r-plug-5),
D169). Otherwise register it once; diagram text alone can never turn it on:

```js
import mermaid from 'mermaid';
import interactions from '@mermaid-js/plugin-interactions';

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
- Unlike v12, callbacks do not depend on `securityLevel` (v12 ran them only with `loose`):
  installing the plugin is the opt-in.
- The plugin does not change the SVG; it adds click listeners to the rendered `g.node[data-id]`
  elements inside the element you pass.

v12 had no click-callback config keys (only `securityLevel` gated them), so no schema key is
`moved` to the plugin and it has no config section.

<!-- BEGIN GENERATED CONFIG SECTION: pnpm gen:config -->

## Config

Generated from the `x-mermaid` annotations in `packages/core/schema/config.schema.yaml`. The full list is in [config-reference.md](./config-reference.md).

### Removed, moved and ignored keys

| Key | Status | Reason | Replacement |
| --- | --- | --- | --- |
| `themeCSS` | ignored | v13 output carries no author stylesheet (R-SEC-2). | `themeVariables`, or `--mermaid-*` CSS variables set by the host page |
| `look` | ignored | `look` is removed (D153): the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. The v12 neo and classic geometry is theme data instead: the redux themes, `neo` and `neo-dark` carry neo geometry and the classic themes carry classic geometry (D152, D181). | `theme`, or the geometry and `dropShadow` theme variables; `handDrawn` comes from the hand-drawn plugin (R-PLUG-8) |
| `htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `altFontFamily` | ignored | Unused by every renderer, also in v12. |  |
| `logLevel` | ignored | v13 does not log; problems are returned in `RenderResult.warnings`. |  |
| `arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `legacyMathML` | ignored | v13 never emits MathML or KaTeX HTML (D175): a math extension typesets `$$…$$` TeX into SVG paths. |  |
| `forceLegacyMathML` | ignored | v13 never emits MathML or KaTeX HTML (D175): a math extension typesets `$$…$$` TeX into SVG paths. |  |
| `flowchart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render. The redux themes carry v12's `look: neo` geometry (D152). | `theme`, or the geometry and `dropShadow` theme variables |
| `flowchart.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `flowchart.htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `swimlane.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `agentflow.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `sequence.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `sequence.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `sequence.messageMargin` | ignored | v12's sequence renderer never read it; messages are spaced by `boxMargin` and their label height. |  |
| `sequence.messageFont` | ignored | v12's internal font helper; v13 reads the `messageFontSize`, `messageFontFamily` and `messageFontWeight` keys. |  |
| `sequence.noteFont` | ignored | v12's internal font helper; v13 reads the `noteFontSize`, `noteFontFamily` and `noteFontWeight` keys. |  |
| `sequence.actorFont` | ignored | v12's internal font helper; v13 reads the `actorFontSize`, `actorFontFamily` and `actorFontWeight` keys. |  |
| `gantt.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `journey.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `timeline.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `class.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the class renderers never did. |  |
| `class.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `class.titleTopMargin` | ignored | The class SVG draws no front-matter `title`, as flowchart's. |  |
| `class.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `class.dividerMargin` | ignored | Read only by v12's old class renderer (`svgDraw.js`), which 12.2.0 no longer reached: both keywords used the unified renderer, which did not read it. |  |
| `class.textHeight` | ignored | Read only by v12's old class renderer (`svgDraw.js`), which 12.2.0 no longer reached: both keywords used the unified renderer, which did not read it. |  |
| `class.htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `state.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the state renderers never did. |  |
| `state.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `state.titleTopMargin` | ignored | The state SVG draws no front-matter `title`, as flowchart's (D122). |  |
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
| `pie.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `quadrantChart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `xyChart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `requirement.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `architecture.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `mindmap.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `ishikawa.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `kanban.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `gitGraph.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `gitGraph.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `c4.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `sankey.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `packet.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `block.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `eventmodeling.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `treeView.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `radar.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `usecase.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `venn.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `wardley-beta.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `cynefin.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `railroad.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `dompurifyConfig` | removed | v13 has no HTML sanitizer: output is safe by construction (R-SEC-1). | none |

### Changed defaults

| Key | v13 default | Reason |
| --- | --- | --- |
| `theme` | `"redux-color"` | The default changes from `default` to `redux-color`, the theme v12's flowchart renders by default (D151, amending D55). 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes, plus `default`, `dark`, `forest`, `neutral`, `base`, `neo` (v12 `theme-neo.js`, D180, D181) and `neo-dark` (v12 `theme-neo-dark.js`, cleaned up into a dark theme, D183). `null` renders `base`, with a `THEME_UNAVAILABLE` warning. |
| `layout` | `"layered"` | The default changes from `elk` to `layered`, the built-in engine (DESIGN §6.1). The v12 value `dagre` stays valid and maps to `layered` silently. `elk` and `elk.<algorithm>` (and the `flowchart-elk` header) are laid out by `@mermaid-js/layout-elk` once it is registered; without it they draw with `layered` and add one `ELK_NOT_INSTALLED` warning (D173). Other engines come in through `registerLayoutLoaders` (R-LAYOUT-2), and an unknown name falls back to `layered` with a `LAYOUT_UNKNOWN` warning. Text output (`format: 'ascii'`) always lays out with `layered` and the cell profile, plugin or not: any other name gives one `ASCII_DROPPED` warning (`feature: 'layout'`) and nothing else, and its engine is never loaded (D179). |
| `maxEdges` | `5000` | The default changes from 500 to 5,000 (D31): one `A & … --> B & …` line multiplies edges, and v13 draws 5,000 quickly. Integrator-only; it sets the `maxEdges` render limit (R-SEC-5); an explicit `limits.maxEdges` wins. Over the limit, render() rejects with a `LIMIT` error. |
| `securityLevel` | `"default"` | The default changes from `strict` to the new level `default` (D48, D75), which keeps v12's absolute `http`/`https`/`mailto` links; `strict` now keeps relative links only, so an integrator who set `strict` explicitly loses absolute links (set `default` to keep them). `loose`, `antiscript` and `sandbox` act as `default` with a warning. |
| `flowchart.curve` | `"rounded"` | The default changes from `basis` to `rounded`, the look of v12's default ELK layout: stepped routes whose corners are arcs of radius 5 (less on a short leg). Set `basis` to keep S-curves. `linear` draws straight segments; `step`, `stepBefore` and `stepAfter` draw stepped routes; `rounded` draws straight segments with rounded corners; every other value draws S-curves (the layout engine routes edges, not a d3 curve factory). |
| `sequence.actorFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.actorFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.noteFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.noteFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.messageFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.messageFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `class.padding` | `12` | The documented default changes from 5 to 12, the padding v12 drew class boxes with (D125): its schema said 5 but its renderer never got it. Unset, namespaces keep v12's 16 and notes its 6; set, the value pads all three. |
| `class.diagramPadding` | `8` | The documented default changes from 20 to 8, the padding v12 drew class diagrams with (D125): its renderer ignored the key and used 8. |

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
- **An init `config` key** is moved into the detected diagram's section, as in v12
  (`%%{init: {"config": {"curve": "linear"}}}%%` in a flowchart sets `flowchart.curve`).
- **`fontFamily`** from `initialize()` or diagram text also sets `themeVariables.fontFamily`,
  as in v12.

Removed and ignored keys, with what to use instead:

- `htmlLabels`, `flowchart.htmlLabels`, `class.htmlLabels`: removed. Labels are always SVG text
  (D5); markdown strings cover bold, italic, code and lists ([Labels](#labels-and-text)).
- `dompurifyConfig`: removed. There is no HTML sanitizer to configure; the SVG writer only
  emits allow-listed elements and attributes, and `assertInert` checks the output (R-SEC-1).
- `themeCSS`: ignored. The output carries no author stylesheet (R-SEC-2). Use `themeVariables`,
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
| Themes `default`, `base`, `dark`, `forest`, `neutral`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color`, `redux-dark-color`, `null` | 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes ported from v12, plus `default`, `dark`, `forest`, `neutral`, `base`, `neo` and `neo-dark`. `neo` is v12's `theme-neo.js` with v12's `look: neo` geometry (the redux family's), corner radius 3, its blurred shadow and no per-item palette. `neo-dark` is v12's `theme-neo-dark.js` with the same geometry and tokens, cleaned up into a dark theme ([neo-dark](#neo-dark)). `null` renders `base`, with a `THEME_UNAVAILABLE` warning. An unknown name renders the default theme with the same warning | D151, D180, D181, D183, R-THEME-6, R-THEME-7 |
| — | `theme: 'auto'`: the default theme, switching to `dark` under `prefers-color-scheme: dark` through a small custom-property `<style>` | R-THEME-8 |
| Colours computed once in JS (khroma) and written into a `<style>` element | Colours are presentation attributes reading CSS variables: every theme variable is `--mermaid-<name>` on the host page, with the theme value as fallback; derived colours use `color-mix()`, and contrast text and `invert()` use relative colour syntax (`color(from …)`), so they follow a host override of the colour they derive from. A page can re-theme rendered SVGs with CSS. Limit: contrast text picks between the theme's two ink values; overriding the ink variables themselves (`--mermaid-textColor`) does not change contrast-derived text such as `nodeTextColor` (set `--mermaid-nodeTextColor` directly) `initialize({ output: { cssVariables: false } })` writes literal colours instead | R-THEME-2, R-THEME-3, R-THEME-4 |
| `themeVariables` from diagram text checked against a character set only | Values are checked by kind (colour, length, font, weight) and a bad one is dropped with `THEME_VARIABLE_DROPPED`. Names v13 does not use are ignored | R-SEC-3 |
| `themeCSS` | Ignored; see [Config behaviour](#config-behaviour) | R-SEC-2 |
| Label text colour fixed by the theme | When a `style`/`classDef` fill makes the theme's text colour unreadable, the label switches to black or white | R-THEME-12 |
| `look: neo` / `look: classic` | `look` is removed: the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. What `look` switched in v12 is theme data: the redux themes, `neo` and `neo-dark` carry v12's neo geometry and the classic themes (`default`, `dark`, `forest`, `neutral`, `base`) carry v12's classic geometry. For a mix, override the variables ([Theme geometry](#theme-geometry)) | D152, D153 |
| `look: handDrawn` | Ignored like any other `look`, with the same generic `LOOK_REMOVED` warning; core names no plugin. Hand-drawn strokes will come from an optional plugin, which will claim `look: handDrawn` as a legacy alias of its own key once plugins can declare config | D7, D153, R-PLUG-8 |
| Neo gradients (`useGradient`, `gradientStart`, `gradientStop`) | Public theme variables. `neo` and `neo-dark` turn the gradient on (`#0042eb` to `#eb0042`, left to right); every other theme has it off, and any theme can turn it on in `themeVariables`. The SVG then carries one `<defs>` with a `<linearGradient id="<idPrefix>-gradient">`, and the outlines v12 neo strokes with the gradient take `url(#<idPrefix>-gradient)`, so two diagrams on a page never share it. The stops read `--mermaid-gradientStart` / `--mermaid-gradientStop`. See [Neo gradient](#neo-gradient) | D182, R-THEME-7 |
| Drop shadow under `look: neo` | A hard drop shadow in the redux themes, as the CSS `filter` from the `dropShadow` theme variable: offset 4px, no blur, 6% opacity, black on light themes and white on dark. `neo` keeps v12's blurred shadow, `drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))`, and `neo-dark` its own, `drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))`. It is on node outlines, icons, subgraphs and collapsed groups, not on edges, edge labels or swimlanes. Under `neo` and `neo-dark`, sequence participants take the theme's drop shadow, as notes and fragment labels do; v12 drew them with a separate 6% white offset filter that did not show on `neo` (D184). The classic themes set `dropShadow: none`. No `<defs>` and no ids, so several diagrams on a page never collide | D151, D152, D181, D184 |
| Per-subgraph colour in `redux-color` | Each subgraph takes a palette slot by declaration order, cycling after twelve: border from `borderColorArray`, fill from `bkgColorArray`. `redux-dark-color` has an empty fill palette, so its subgraphs are coloured on the border only. `redux` and the classic themes carry no palette. Colour is on whenever the theme has a non-empty `borderColorArray` (a `themeVariables` palette turns it on in any theme), and a collapsed subgraph's card, separator and dots take its slot too. As in v12 the slot is written as `data-color-id="color-<n>"` on the cluster or collapsed node, and an author `style` / `classDef` still wins. Swimlanes are not drawn yet, so there is nothing to colour there | D151, D152 |
| Sequence colours `actorBkg`, `actorBorder`, `actorTextColor`, `actorLineColor`, `signalColor`, `signalTextColor`, `labelBoxBkgColor`, `labelBoxBorderColor`, `labelTextColor`, `loopTextColor`, `activationBkgColor`, `activationBorderColor`, `sequenceNumberColor` | The same names, derived as v12 `theme-base.js` derives them, with each built-in theme's v12 values pinned where they differ; `--mermaid-<name>` like every variable. `activationBorderColor` is `secondaryColor` with 12.5% black, close to khroma's `darken(…, 10)` | R-THEME-2, D71 |
| Numbered palettes (`pie*`, `git*`) | Not in the 13.0 inventory; they come with the diagram types that use them. `cScale0`–`cScale11` are set by `redux-color` (the fixed Tailwind-300 set) | R-CONF-5 |

Colours are close to, but not byte-equal with, v12. Where a v12 colour pair failed WCAG AA
contrast, v13 changes it (for example the dark theme's `edgeLabelBackground`).

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
| `dropShadow` | `drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))`; white instead of black on `redux-dark` and `redux-dark-color`; `drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))` on `neo`; `drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))` on `neo-dark` | `none` |
| `classText` (colour: class diagram text) | `textColor` | `primaryTextColor` |
| `classMarkerStrokeWidth` / `classFilledMarkerStrokeWidth` (outline of hollow / filled class markers) | 2 / 0 | 1 / 1 |
| `extensionMarkerLength` / `extensionMarkerGap` (inheritance triangle) | 8 / 8.25 | 17 / 0.25 |
| `compositionMarkerGap` / `dependencyMarkerGap` | 2.75 / 4 | 0.25 / 1 |
| `erZeroOrMoreCircleOffset` (ER, centre of a zero-or-more circle from the outline) | 28 | 30 |
| `rowOdd` / `rowEven` (ER attribute rows) | the entity fill (`mainBkg`): v12 neo leaves rows unfilled | v12's `rowOdd` / `rowEven`, the same colours (khroma's HSL lightening, D117) |
| `erEdgeLabelBackground` (ER relationship labels) | white (`redux-color`), `#16141f` (`redux-dark-color`); `edgeLabelBackground` in `redux`, `redux-dark`, `neo` and `neo-dark` | `edgeLabelBackground` |
| `erMarkerFill` (ER zero circles) | `mainBkg` | white |
| `compositeBackground` (state) | `background`; `#16141f` on `redux-dark` and `redux-dark-color` | `background` |
| `compositeTitleBackground` (state) | `#f9f9fb`; `#16141f` on `redux-dark` and `redux-dark-color`; `mainBkg` on `neo` and `neo-dark` | `mainBkg` |
| `altBackground` (state) | `#f9f9fb`; `#16141f` on `redux-dark` and `redux-dark-color`; `#f0f0f0` on `neo`; `#404040` on `neo-dark` (D189) | `#f0f0f0` (`default`, `forest`); `#555555` (`dark`); `#f4f4f4` (`neutral`); `tertiaryColor` (`base`) |

The palette rows apply to the two colour themes only; plain `redux`, `redux-dark`, `neo` and
`neo-dark` carry no palette. A padding variable (the `…Padding…` names) takes a px number or a multiple of
`flowchart.padding` written `padding` or `<n> * padding`, so `nodePaddingX: '2 * padding'`
gives a redux theme classic node padding. `circlePadding` is added to the label's diagonal,
so it counts twice towards the diameter compared with the per-side node padding.

- **Arrowheads** stop `arrowheadGap` short of the node outline, so in the redux themes a 4px gap
  separates the tip from the node, as in v12 neo. They stay inline paths with no `<marker>`;
  v12's `refX` and `stroke-dasharray` mechanism is not needed, and dashed and dotted edges look
  the same as in v12. Sizes are what v12 draws, not its marker boxes: a v12 cross does not fill
  its box, so `crossArrowheadSize` is the arm span (10.4 neo, 9 classic) and the neo stroke is
  v12's 2.5 scaled by the marker's 0.8.
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
| `edgeLabelBackground`, `erEdgeLabelBackground` | `#474949` (`secondaryColor`) | `#323333` (`secondaryColor` darkened 30%) | D183: dark rules |
| `strokeWidth` | 1 | 2, as in `neo` | D183 |
| `secondaryTextColor` | `#b8b6b6` (4.49:1 on `secondaryColor`) | `#b9b7b7` (AA) | D183, R-THEME-9 |
| `altBackground` (state: a nested composite's body) | `#f0f0f0`, on which the `#cccccc` transitions and arrowheads all but vanish | `#404040` | D189, D183 |

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
lifted 0.01 so they take the gradient (v12 0.001) (D185).
No node part is filled with the gradient: the flowchart fork and join bar is stroked with it and
filled in plain `nodeBorder`, the same colour as the `lineColor` v12 neo filled it with (D185).

## Layout

| v12 | v13 | Why |
| --- | --- | --- |
| Default layout `elk` (12.2.0), formerly `dagre` | Default `layered`, the engine built into core | DESIGN §6.1 |
| `layout: dagre`, `layout: elk`, `elk.<algorithm>`, `flowchart-elk` header | `dagre` is drawn with `layered`, silently. The ELK names and the `flowchart-elk` header are drawn with `layered` and one `ELK_NOT_INSTALLED` warning until `@mermaid-js/layout-elk` is registered | R-PLUG-8, D173 |
| An unknown layout name falls back to `dagre` with a console warning | Falls back to `layered` with a `LAYOUT_UNKNOWN` warning | R-ERR-4 |
| `nodeSpacing`, `rankSpacing`, `diagramPadding` | Honoured with v12's defaults (50, 50, 8) | |
| `curve` picks a d3 curve factory | The engine routes edges: `linear` draws straight segments, `step`/`stepBefore`/`stepAfter` stepped ones, `rounded` (the default) straight segments joined by arcs of radius 5, every other value S-curves | |
| dagre adds 25 px of rank spacing inside subgraphs | Not reproduced: subgraphs are slightly more compact | |

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
| `lineHops` drew hops and dropped the rounding of corners | Same hops (arc or gap, v12's radius and rule), drawn on straight runs only; corners keep their rounding | D174 |
| v12's frame-evening and label post-passes (`evenGroupFrames`, `separateOppositeEdgeLabels`, `slideTerminalLabelsOffFrames`, `putTerminalLabelsOnTheirSide`, marker segment lengths) | Not ported: no `elk.*` key controls them, and v13's diagrams clip edges at their own outlines. Two edges into one side can share an end point | D174 |
| Spacing from `spacing.baseValue` | Spacing comes from the diagram's `nodeSpacing` and `rankSpacing`, as for `layered` | D174 |
| Text output did not exist | Text output (`format: 'ascii'`) always lays out with `layered` and the cell profile, plugin or not, with one `ASCII_DROPPED` warning (`feature: 'layout'`) for the ELK name and no `ELK_NOT_INSTALLED` | D179 |

### Class diagram layout

| v12 | v13 | Why |
| --- | --- | --- |
| Class diagrams default to ELK | Laid out with `layered`, the engine built into core; `layout: elk` is accepted and drawn with `layered` until the ELK plugin (M3.5) is registered | D106 |
| Class `nodeSpacing` and `rankSpacing` were read from the `state` section (falling back to 50), and `class.diagramPadding` was ignored (8 px) | `class.nodeSpacing`, `class.rankSpacing` and `class.diagramPadding` are honoured, with v12's effective defaults (50, 50, 8) | spec #126 |
| Class edges followed `flowchart.curve` (a d3 curve factory) | Still follow `flowchart.curve`, read as for flowcharts: `rounded` (the default) and `step`/`stepBefore`/`stepAfter` are right-angle routes, `linear` straight segments, every other value S-curves | spec #126 |
| A lollipop interface was a top-level node, outside its class's namespace | It sits in the namespace of its class | spec #126 |

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
| HTML labels in `<foreignObject>` (`htmlLabels: true`) or SVG text | SVG `<text>`/`<tspan>` only | D5 |
| Any HTML in labels, sanitised by DOMPurify | `<b>`/`<strong>` and `<i>`/`<em>` are drawn bold and italic, `<br>` breaks the line. Other HTML element tags are dropped and their text kept (`<img>` draws nothing, `<a>` is not a link, `<sub>`/`<sup>`/`<u>` draw plain text). Text that only looks like a tag, such as `List<T>`, is shown as written | R-TEXT-3 |
| Markdown strings (`` "`**bold**`" ``) | Same subset: `**`/`__` bold, `*`/`_` italic, `` `code` `` (monospace), `- ` and `* ` bullet lists (one nesting level), backslash escapes, `<br>` and newlines | R-TEXT-2 |
| Entities: Mermaid's `#quot;`/`#35;` and HTML `&…;` | Both decoded; about 45 named HTML entities plus numeric ones. Unknown entities stay literal | |
| KaTeX math (`$$…$$`) | Rendered by the optional `@mermaid-js/plugin-math` (`registerExternalDiagrams([math])`): MathJax typesets the TeX into SVG paths, so glyph shapes differ from KaTeX's. MathJax loads only for a diagram with math; `renderSync` needs `prepare()` or `preload({ math: true })` first. TeX that does not parse is shown as written with a `MATH_ERROR` warning. Every label core lays out takes math: flowchart nodes, edges and subgraph titles; class, state and ER labels; sequence messages, notes, participants, fragment and box labels. Without the plugin the TeX is shown as written, with one `MATH_NOT_RENDERED` warning per render. Text output always shows the TeX as written, with one `ASCII_DROPPED` warning (`feature: 'math'`). `legacyMathML` and `forceLegacyMathML` are ignored. See [Math](#math) | D5, D175, D176, D178, D179 |
| `fa:fa-car` in HTML labels: an icon from a registered pack, else `<i class="fa fa-car">` for Font Awesome's CSS to draw | An icon from a registered Iconify pack, drawn as SVG paths by the optional `@mermaid-js/plugin-icons`, in every label core lays out (sequence too); page CSS draws nothing. An icon that does not resolve is shown as written, with one `ICON_NOT_RENDERED` warning per render. See [Icons](#icons) | D290, D291, D292, D296 |
| Text measured by the browser | Measured by canvas when present, else by built-in tables for Trebuchet MS, Verdana and Arial; line height comes from the font, so labels are not pixel-equal with v12 | R-TEXT-4 |
| Labels wrap at `flowchart.wrappingWidth` (HTML labels) | Node labels, plain and markdown alike, wrap at `wrappingWidth` (120) and are widened to `minNodeWidth` (120), except circles; edge labels wrap at 200. CJK text breaks between characters, and a word wider than the box is split | |

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
- **Mindmap** is not ported yet (`UNSUPPORTED_DIAGRAM`). When it is, `::icon(fa fa-book)` and
  `::icon(mdi:fire)` draw from the registered packs, placed as v12's older mindmap renderer
  placed them (D297). 12.2.0 parsed `::icon()` but drew nothing, so any mindmap icon is new; one
  that does not resolve is shown as written in the icon's place, with `ICON_NOT_RENDERED` (D286).
- **Text output** shows label icons as written, with one `ASCII_DROPPED` warning
  (`feature: 'icon'`); an icon shape is a box with its label (`feature: 'image'`) (D299).
- **Size.** Core does not change with the plugin installed (R-PLUG-8); the plugin is about
  5.5 KB gz, plus the packs your diagrams load.

## Flowchart syntax

The flowchart parser accepts exactly the v12 language: a differential test runs v12 and v13
over every e2e fixture and the v12 spec and docs examples, and the grammar is published in
[syntax/flowchart.md](./syntax/flowchart.md). The differences:

- **Error messages** are new: they name what was expected in words (``Expected an arrow such
  as `-->` …``), show the line with a caret, and never mention token or rule names. Every error
  in the text is reported, not only the first (R-PARSE-4).
- **A bare `subgraph`** (no id) is accepted; v12 crashed with a `TypeError`.
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
- **Step animation** (`step` on edges, `flowchart.stepNumbers`, `flowchart.stepDuration`) and
  edge `animate`/`animation` are parsed but not drawn.
- **`style`, `classDef` and `linkStyle`** go through a per-property allow-list; an unknown
  property or unsafe value (`url(`, `expression(`, `javascript:`, `@import`, …) is dropped with
  `STYLE_PROPERTY_DROPPED` or `STYLE_VALUE_DROPPED`. `color` sets the label's fill.
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
- **Ignored:** `titleTopMargin` (no front-matter title is drawn, D122), `useWidth` (only gantt
  read it), and the sizes only v12's
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
| Labels: `<foreignObject>` HTML (unified) or `<text>` (old) | `<text>`/`<tspan>` | No HTML mode (D5) |
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
| Edge label: `<g class="edgeLabel">` with HTML, background at 50% opacity; old: `<g class="stateLabel">` with a `rect.box` | `<g class="edgeLabel" data-id>` with an opaque `edgeLabelBackground` `<rect>` and a `<text>` | As flowchart |
| `click`: the node wrapped in `<a xlink:href target="_blank" title>` after drawing | `<a href target="_blank">` inside the node group (only URLs that pass `securityLevel`), tooltip as an SVG `<title>`; a composite is not linked (v12 searched `g.node` only) | No script in output (R-SVG-4, R-SVG-5) |
| `data-color-id` on composites and regions, coloured by `[data-color-id]` CSS rules: outline and title strip tinted, regions tinted | The same `data-color-id="color-<n>"`, slot per composite in declaration order, shared by its regions; a styled composite spends its slot unpainted. Colours are attributes; the region frames are not tinted (D121) | Palette from `borderColorArray` / `bkgColorArray` only, never a theme name (D152) |
| `classDef` / `style` as CSS (`.name > * { … !important }`), reaching the composite body but not its title strip | Presentation attributes after the allow-list (R-SEC-3), on a state's shape, on both of a composite's rects, and `color` on the label only | Unknown properties and unsafe values are dropped with a warning |
| Front-matter `title` drawn as `statediagramTitleText` | Not drawn | As flowchart (D122) |

Colours map to theme variables v13 already has (D152): states `mainBkg` / `nodeBorder` /
`nodeTextColor` (v12 `stateBkg`, `stateBorder`, the node label colour), start, fork and join
`lineColor` (v12 `specialStateColor`), the end dot `nodeBorder` (v12 `innerEndBackground`),
transitions `lineColor` and `arrowheadColor` (v12 `transitionColor`), labels `textColor` on
`edgeLabelBackground`, composite titles `titleColor`, notes `noteBkgColor` / `noteBorderColor` /
`noteTextColor`. A composite's title band reads `compositeTitleBackground`, its body
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
- YAML anchors are rejected, and `__proto__`/`constructor`/`prototype` keys are dropped with a
  warning.
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
| Edge label: `<g class="edgeLabel"><g class="label">…foreignObject…` | `<g class="edgeLabel" data-id>` with a background `<rect>` and a `<text>` | Text labels |
| Collapsed subgraph: a node drawn by the cluster code | `<g class="node cluster collapsed" data-ast="s:<id>">` | It is drawn as a node with its subgraph's AST id |
| `style`/`classDef`/`linkStyle` as a `style` attribute | Presentation attributes (`fill`, `stroke`, …) after the allow-list (R-SEC-3) | Unknown properties and unsafe values are dropped with a warning |
| `click A "url"` wraps the node in `<a xlink:href>`; tooltips are an HTML hover div | `<a href>` inside the node group (only URLs that pass `securityLevel`); tooltips are an SVG `<title>`; `click … callback` draws nothing (interactions plugin) | No script in output (R-SVG-4, R-SVG-5) |
| `viewBox` may start at negative coordinates | `viewBox="0 0 w h"` | Layout places the drawing at the origin |

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
| v12 classic themes gave `rect` blocks and boxes their own grey drop shadow (`g rect.rect { filter: dropShadow }`) | No shadow in the classic themes: `rect` blocks and boxes take `dropShadow` only where the theme sets it (the redux themes) | One shadow variable per theme (D152, D131) |
| A fragment title that is empty once read (`loop </style>`) | Not drawn, as v12 skipped it | v13 drew `[]` before the fix |
| A refused per-key font family (`sequence.actorFontFamily: "x;color:red"`) went into the inline style | Dropped with `STYLE_VALUE_DROPPED`; the label is measured and drawn in the Mermaid font | Inert output (R-SEC-3) |
| Participants: a lifeline `<line id="actorN" class="actor-line 200" name>` in one group, the top box in another, the bottom box drawn later; `data-et`, `data-type`, `data-id="<name>"`, `name` attributes; `id="root-N"` for menus | One `<g class="participant participant-<kind>" data-id="<id>" data-ast="p:<id>">` per participant holding its `<line class="actor-line">`, `<g class="actor-top">` and `<g class="actor-bottom">`; no `name`, `data-et` or `data-type` | One element per participant maps it to its source (R-PARSE-8) |
| Lifelines ran to `y2="2000"` and were cut by the viewBox | A lifeline ends at the bottom row (or where the participant is destroyed) | The layout places it (#141) |
| Messages: `<text class="messageText">` and `<line>`/`<path>` as siblings, `data-et="message"`, `data-id="i<n>"`, `data-from`, `data-to` | `<g class="message" data-id data-ast="m:<from>><to>#<n>">` holding the label, the line or self-loop path, the heads, central-connection circles and the number | One element per message (R-PARSE-8) |
| Notes, frames: `<g data-et="note">` or `<g data-et="control-structure">`, `data-id="i<n>"` | Notes in `<g class="notes">`, each `<g class="note-<placement>" data-id data-ast="note:<n>">`; frames in `<g class="fragments">`, each `<g class="fragment fragment-<kind>" data-id data-ast="f:<kind>#<n>">` with a `<g class="loopSection" data-ast>` per `else`/`and`/`option` | Same |
| Activations, `rect` blocks and boxes: unclassed groups, appended where the draw loop met them | `<g class="activations">`, painted in start order so an inner bar covers its outer one (each bar has `data-ast` of its `activate` line; a bar opened by `+` or `()` has the message's id as `data-id` and no `data-ast`), `<g class="rects">`, `<g class="boxes">` (each `<g class="box" data-ast="box:<n>">`) | Stacking order is fixed: boxes, rects, participants, activations, frames, notes, messages |
| Text: `<text>` with a `<tspan>` per line and a `style="font-…"` from `sequence.*Font*` | `<text>`/`<tspan>`; a section whose per-key font differs from the Mermaid font writes `font-family`/`font-size`/`font-weight` on its group (`participants`, `messages`, `fragments`, `notes`) | Labels are drawn in the font they were measured in |
| Title: an unclassed `<text>` at a fixed place; box labels `class="text"` in default black | `<text class="sequenceTitle">` centred above the drawing; box labels in `textColor` | Theme colour on every text |
| The `redux-color` / `redux-dark-color` names switched per-participant colour; `look: neo` switched the corner radius (6 / 3), the actor, note, label tab and `rect` shadow | The palette (`borderColorArray`, `bkgColorArray`, `data-color-id="color-<n>"` on the participant and its activations), `actorRadius` and `dropShadow` theme variables. `rect` blocks and boxes take the shadow only where the theme has one (see below) | D152 |
| Bottom symbols of the figure kinds sat a few px off the top ones (`isFooter` offsets) | The bottom symbol is drawn like the top one | One drawing per kind |
| v12's `look: neo` geometry: the band model of `actorBands.ts` (rows as tall as glyph band 44 + 6 + label + 6, one lifeline start per row, the symbols on the band, the stick figure scaled to it, the database cylinder as tall as it, a `collections` stack 6 shorter), messages 3 px shorter, label tabs 15 px taller, 30 px more below the drawing | The same geometry in the redux themes and v12 classic geometry in the classic themes, from the `actorGlyphBand`, `messageEndGap`, `labelBoxExtraHeight` and `actorFooterPadding` theme variables (see "Theme geometry"), so any theme can take either. Text output draws every symbol as a box and ignores them (#194) | D152 |
| A front-matter `title` was drawn above the diagram like a `title` statement | The SVG draws only the `title` statement; a front-matter `title` is not drawn, as in flowchart and state (D122), and does not feed the accessible name: only `accTitle` does (D133). Text output prints it on top when there is no `title` statement | One cross-type decision on front-matter titles (D122, D133) |
| `actor`/`link` popup menus (`actorPopupMenu`, `onclick`) | Not drawn by the renderer; the interactions plugin adds them | No script in output (R-SVG-4) |

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
| Relationship label `<g class="edgeLabel">` with HTML on `mainBkg` (`.labelBkg`; the `.edgeLabel[data-look="neo"]` rule never matched, as v12 sets `data-look` on the path only) | `<g class="edgeLabel" data-id>` with an opaque background `<rect>` filled with `mainBkg`, in every theme, and a `<text>` | Text labels |
| Multiplicities: one `<g class="edgeTerminals">` per end, HTML at 11px | One `<g class="edgeTerminals" data-id>` per relationship holding a `<text>` per end, at `classTerminalFontSize` (11px in every theme), measured at that size by the layout | Text labels |
| Class text coloured by `classText` through the `<style>` (`.nodeLabel`, `.edgeLabel`, `.label text`) | `classText` is a theme variable and colours names, annotations, members, relationship labels, multiplicities and interface names; notes keep `noteTextColor` and namespace titles `titleColor`. On a box an author `style` fills, the text switches to black or white as in flowcharts | R-THEME-12 |
| Note: `<g class="node …">` with the rough.js note shape | `<g class="node note" data-id="note0" data-ast="note:k">` with `<rect class="outer-path">` (`noteBkgColor`, `noteBorderColor`) and the text, left-aligned | Text labels |
| Lollipop interface: a node with an invisible (`opacity: 0`) rect and its label | `<g class="node interface" data-id="interface0" data-ast="i:Name">` holding only the text | Nothing invisible is drawn |
| Namespace: `<g class="cluster" id>` with `<rect>` and an HTML label | `<g class="cluster namespace" data-id="<qualified id>" data-ast="s:<id>">` with `<rect>` and `<text class="cluster-label">`. A namespace made only as the ancestor of a dotted one (`X` of `namespace X.Y`) has no `namespace` statement of its own, so it has no `data-ast` | Text labels; one `data-ast` per AST node (R-PARSE-8) |
| Per-class colour through `[data-look][data-color-id].node .outer-path` rules in the `<style>` | `data-color-id` is kept; the colours are presentation attributes on the box and its dividers; an author `style` / `classDef` still wins | No style sheet |
| `classDef` styles reached a class through the generated `.name > *` CSS rules, even when the class was given after the `classDef` | The `classDef` styles of every CSS class of the class, then its own `style`, as presentation attributes after the allow-list | Unknown properties and unsafe values are dropped with a warning (R-SEC-3) |
| Under `look: neo` (the redux family, `neo`, `neo-dark`), the `[data-look=neo]` rules beat a `style` / `classDef` fill and stroke on a class box | `style` and `classDef` fill and stroke on a class box take effect in every theme | D187, D152 |
| Class ids, labels and member text passed through `sanitizeText` (DOMPurify), so `A : +List<T> items` lost `<T>` | Text is escaped when written, never sanitised: `+List<T> items` is shown as written, and known HTML tags are read as the label subset ([Labels and text](#labels-and-text)) | R-SEC-1; the flowchart's rule |
| `link` / `click … href` as `<a xlink:href>`; tooltip as an HTML hover div; `callback` / `click … call` bound with `bindFunctions` | `<a href target>` inside the node group (URLs that pass `securityLevel`); the tooltip is an SVG `<title>`; callbacks draw nothing (interactions plugin) | R-SVG-4, R-SVG-5 |
| Front-matter `title` drawn above the diagram (`classDiagramTitleText`) | Not drawn, as for flowcharts | v13 renderers draw no title yet |

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
| Edge label `<g class="edgeLabel">` with `<foreignObject>` (`span.edgeLabel`, `div.labelBkg`) | `<g class="edgeLabel" data-id>` with a background `<rect>` and a `<text>` | Text labels; labels carry no `data-ast` |
| Subgraph `<g class="cluster" id>` with `<g class="cluster-label">` | `<g class="cluster …" data-id="<name>" data-ast="s:<name>">` with `<rect>` and `<text class="cluster-label">` | |
| Front-matter `title` drawn as `text.erDiagramTitleText` | Not drawn yet, as in the flowchart | |
| Hand-drawn look: background copies of every entity (`<id>-background`) | None (`look` is removed, D153) | |
