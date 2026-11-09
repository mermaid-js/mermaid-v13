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
| `themeVariables.THEME_COLOR_LIMIT` | ignored | The numbered `cScale` palettes always have twelve slots and the git palettes eight, and a diagram cycles through them (D258, D267). |  |
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
| `journey.sectionFills` | ignored | Sections are filled from the theme's `fillType0`–`fillType7`, cycling over all eight (D241). In v12 the theme's `fillType<n>` style rules hid these colours in every theme. |  |
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
| `timeline.sectionFills` | ignored | v12's timeline never read it; boxes take the `cScale` palettes or `mainBkg`. |  |
| `timeline.sectionColours` | ignored | v12's timeline never read it; box text takes `cScaleLabel` or `nodeBorder`. |  |
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
| `pie.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the pie renderer never did. |  |
| `pie.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `quadrantChart.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the quadrant chart renderer never did. |  |
| `quadrantChart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `xyChart.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the XY chart renderer never did. |  |
| `xyChart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `xyChart.xAxis.$ref` | ignored | Not an option; 12.2.0's default config leaked it (a schema reference). |  |
| `xyChart.yAxis.$ref` | ignored | Not an option; 12.2.0's default config leaked it (a schema reference). |  |
| `requirement.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `architecture.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `mindmap.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the mindmap renderer never did. |  |
| `mindmap.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `mindmap.layoutAlgorithm` | ignored | v12 never read it. Mindmap lays out with core's `tree` engine (D284); `mindmap.layout` or the top-level `layout` chooses another engine, and `cose-bilkent` and `tidy-tree` there map to `tree`. | `mindmap.layout` or `layout` |
| `ishikawa.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
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
| `c4.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `sankey.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `packet.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the packet renderer never did. |  |
| `packet.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `block.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `eventmodeling.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `treeView.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `radar.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the radar renderer never did. |  |
| `radar.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `usecase.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `venn.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `wardley-beta.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `cynefin.useWidth` | ignored | Only v12's gantt renderer read `useWidth`; the cynefin renderer never did. |  |
| `cynefin.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `railroad.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `dompurifyConfig` | removed | v13 has no HTML sanitizer: output is safe by construction (R-SEC-1). | none |

### Changed defaults

| Key | v13 default | Reason |
| --- | --- | --- |
| `theme` | `"redux-color"` | The default changes from `default` to `redux-color`, the theme v12's flowchart renders by default (D151, amending D55). 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes, plus `default`, `dark`, `forest`, `neutral`, `base`, `neo` (v12 `theme-neo.js`, D180, D181) and `neo-dark` (v12 `theme-neo-dark.js`, cleaned up into a dark theme, D183). `null` renders `base`, with a `THEME_UNAVAILABLE` warning. |
| `layout` | `"layered"` | The default changes from `elk` to `layered`, the built-in engine (DESIGN §6.1). The v12 value `dagre` stays valid and maps to `layered` silently. `elk` and `elk.<algorithm>` (and the `flowchart-elk` header) are laid out by `@mermaid-js/layout-elk` once it is registered; without it they draw with `layered` and add one `ELK_NOT_INSTALLED` warning (D173). Other engines come in through `registerLayoutLoaders` (R-LAYOUT-2), and an unknown name falls back to `layered` with a `LAYOUT_UNKNOWN` warning. A diagram can name its own default engine (D284): mindmap lays out with `tree` (D280, loaded lazily) when no config layer sets `layout`, maps v12's `cose-bilkent` and `tidy-tree` to it silently (D282), honours `layered`, `dagre` and an installed `elk.*`, and draws an unknown or uninstalled name with `tree` and the same warnings; other diagrams do not reach `tree` (D285). Text output (`format: 'ascii'`) always lays out with `layered` and the cell profile, plugin or not: any other name gives one `ASCII_DROPPED` warning (`feature: 'layout'`) and nothing else, and its engine is never loaded (D179). |
| `maxEdges` | `5000` | The default changes from 500 to 5,000 (D31): one `A & … --> B & …` line multiplies edges, and v13 draws 5,000 quickly. Integrator-only; it sets the `maxEdges` render limit (R-SEC-5); an explicit `limits.maxEdges` wins. Over the limit, render() rejects with a `LIMIT` error. |
| `securityLevel` | `"default"` | The default changes from `strict` to the new level `default` (D48, D75), which keeps v12's absolute `http`/`https`/`mailto` links; `strict` now keeps relative links only, so an integrator who set `strict` explicitly loses absolute links (set `default` to keep them). `loose`, `antiscript` and `sandbox` act as `default` with a warning. |
| `flowchart.curve` | `"rounded"` | The default changes from `basis` to `rounded`, the look of v12's default ELK layout: stepped routes whose corners are arcs of radius 5 (less on a short leg). Set `basis` to keep S-curves. `linear` draws straight segments; `step`, `stepBefore` and `stepAfter` draw stepped routes; `rounded` draws straight segments with rounded corners; every other value draws S-curves (the layout engine routes edges, not a d3 curve factory). |
| `sequence.actorFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.actorFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.noteFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.noteFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.messageFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.messageFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `journey.taskFontSize` |  | The default changes: unset, task and section names are drawn in the theme's `fontSize` (16 by default), as for every diagram type, not v12's 14. A set value takes effect. |
| `journey.taskFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not v12's Open Sans. A set value takes effect. |
| `journey.sectionColours` |  | The default changes: unset, section and task names are `textColor`. When set, it colours them by section band (D225); v12's `['#fff']` reached only the `tspan` fallback, which its default `fo` labels did not show. |
| `journey.titleFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type (D248). A set value takes effect. |
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
| Themes `default`, `base`, `dark`, `forest`, `neutral`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color`, `redux-dark-color`, `null` | 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes ported from v12, plus `default`, `dark`, `forest`, `neutral`, `base`, `neo` and `neo-dark`. `neo` is v12's `theme-neo.js` with v12's `look: neo` geometry (the redux family's), corner radius 3, its blurred shadow and no per-subgraph palette. `neo-dark` is v12's `theme-neo-dark.js` with the same geometry and tokens, cleaned up into a dark theme ([neo-dark](#neo-dark)). `null` renders `base`, with a `THEME_UNAVAILABLE` warning. An unknown name renders the default theme with the same warning | D151, D180, D181, D183, R-THEME-6, R-THEME-7 |
| — | `theme: 'auto'`: the default theme, switching to `dark` under `prefers-color-scheme: dark` through a small custom-property `<style>` | R-THEME-8 |
| Colours computed once in JS (khroma) and written into a `<style>` element | Colours are presentation attributes reading CSS variables: every theme variable is `--mermaid-<name>` on the host page, with the theme value as fallback; derived colours use `color-mix()`, and contrast text and `invert()` use relative colour syntax (`color(from …)`), so they follow a host override of the colour they derive from. A page can re-theme rendered SVGs with CSS. Limit: contrast text picks between the theme's two ink values; overriding the ink variables themselves (`--mermaid-textColor`) does not change contrast-derived text such as `nodeTextColor` (set `--mermaid-nodeTextColor` directly) `initialize({ output: { cssVariables: false } })` writes literal colours instead | R-THEME-2, R-THEME-3, R-THEME-4 |
| `themeVariables` from diagram text checked against a character set only | Values are checked by kind (colour, length, font, weight) and a bad one is dropped with `THEME_VARIABLE_DROPPED`. Names v13 does not use are ignored | R-SEC-3 |
| Nested `themeVariables` sections (`themeVariables.packet.startByteColor`), read by v12 packet, radar, cynefin, wardley and xychart | Each nested key maps onto one flat theme variable of the diagram (`packetStartByteColor`), listed beside it in the [theme variable inventory](theme-variables.md); the flat name is the CSS variable's. When both are set, the flat name wins, with no warning. An unknown nested key is ignored | D335, D540 |
| A plugin's config fragment declaring a theme variable | Unchanged (colour-only, global), but when a diagram's own theme table defines the same name, the diagram's table wins in that diagram's renders | D336, D337 |
| `themeCSS` | Ignored; see [Config behaviour](#config-behaviour) | R-SEC-2 |
| Label text colour fixed by the theme | When a `style`/`classDef` fill makes the theme's text colour unreadable, the label switches to black or white | R-THEME-12 |
| `look: neo` / `look: classic` | `look` is removed: the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. What `look` switched in v12 is theme data: the redux themes, `neo` and `neo-dark` carry v12's neo geometry and the classic themes (`default`, `dark`, `forest`, `neutral`, `base`) carry v12's classic geometry. For a mix, override the variables ([Theme geometry](#theme-geometry)) | D152, D153 |
| `look: handDrawn` | Drawn by the optional `@mermaid-js/plugin-hand-drawn`, whose config fragment takes `look: handDrawn` as an alias of its `handDrawn` key. Without the plugin it is ignored like any other `look`, with one `LOOK_REMOVED` warning that names the plugin. See [Hand-drawn look](#hand-drawn-look) | D7, D153, D300, D303, R-PLUG-8 |
| Neo gradients (`useGradient`, `gradientStart`, `gradientStop`) | Public theme variables. `neo` and `neo-dark` turn the gradient on (`#0042eb` to `#eb0042`, left to right); every other theme has it off, and any theme can turn it on in `themeVariables`. The SVG then carries one `<defs>` with a `<linearGradient id="<idPrefix>-gradient">`, and the outlines v12 neo strokes with the gradient take `url(#<idPrefix>-gradient)`, so two diagrams on a page never share it. The stops read `--mermaid-gradientStart` / `--mermaid-gradientStop`. See [Neo gradient](#neo-gradient) | D182, R-THEME-7 |
| Drop shadow under `look: neo` | A hard drop shadow in the redux themes, as the CSS `filter` from the `dropShadow` theme variable: offset 4px, no blur, 6% opacity, black on light themes and white on dark. `neo` keeps v12's blurred shadow, `drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))`, and `neo-dark` its own, `drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))`. It is on node outlines, icons, subgraphs and collapsed groups, not on edges, edge labels or swimlanes. Under `neo` and `neo-dark`, sequence participants take the theme's drop shadow, as notes and fragment labels do; v12 drew them with a separate 6% white offset filter that did not show on `neo` (D184). The classic themes set `dropShadow: none`. No `<defs>` and no ids, so several diagrams on a page never collide | D151, D152, D181, D184 |
| Per-subgraph colour in `redux-color` | Each subgraph takes a palette slot by declaration order, cycling after twelve: border from `borderColorArray`, fill from `bkgColorArray`. `redux-dark-color` has an empty fill palette, so its subgraphs are coloured on the border only. `redux` and the classic themes carry no palette. Colour is on whenever the theme has a non-empty `borderColorArray` (a `themeVariables` palette turns it on in any theme), and a collapsed subgraph's card, separator and dots take its slot too. As in v12 the slot is written as `data-color-id="color-<n>"` on the cluster or collapsed node, and an author `style` / `classDef` still wins. Swimlanes are not drawn yet, so there is nothing to colour there | D151, D152 |
| Sequence colours `actorBkg`, `actorBorder`, `actorTextColor`, `actorLineColor`, `signalColor`, `signalTextColor`, `labelBoxBkgColor`, `labelBoxBorderColor`, `labelTextColor`, `loopTextColor`, `activationBkgColor`, `activationBorderColor`, `sequenceNumberColor` | The same names, derived as v12 `theme-base.js` derives them, with each built-in theme's v12 values pinned where they differ; `--mermaid-<name>` like every variable. `activationBorderColor` is `secondaryColor` with 12.5% black, close to khroma's `darken(…, 10)` | R-THEME-2, D71 |
| Numbered palettes (`pie*`) | `pie1`–`pie12` and the other pie variables are in the inventory ([Pie chart](#pie-chart)). | R-CONF-5 |
| `git0`–`git7`, `gitInv0`–`gitInv7`, `gitBranchLabel0`–`gitBranchLabel7`, `commitLabelColor`, `commitLabelBackground`, `commitLabelFontSize`, `tagLabelColor`, `tagLabelBackground`, `tagLabelBorder`, `tagBorder`, `tagLabelFontSize` | The same names with v12's values in every theme. `git`, `gitInv` and `gitBranchLabel` are palettes of eight slots: a numbered name replaces one slot and `git: [...]` (or a comma-separated string) the whole list. They follow `primaryColor`, `secondaryColor` and `tertiaryColor` where v12's theme does (`base`, `forest`, `redux-dark`, `redux-dark-color`; `cScale2`–`cScale8` in `dark` and `neutral`, which v12 read as `pie2`–`pie8`, so an author's `cScale<n>` moves them and `pie<n>` does not, D334), the lighter step under `darkMode`, and a `gitInv` slot follows an author's `git<n>` where v12's does. `tagLabelBorder` wins over `tagBorder`, as in v12. v12's `branchLabelColor` is not read: set `gitBranchLabel`. Where v12's branch labels read `labelTextColor` they read the shared label ink `scaleLabelColor` (D334), so an author's `labelTextColor` no longer reaches them. In `base`, `tagLabelBorder` takes v13's `primaryBorderColor` (v12's border step changes saturation, which the derivation DSL has none of), and under `darkMode` `base`, `neo`, `redux` and `redux-color` keep their tag text colour where v12 turned it to `#eee`. A gitGraph with nine or more branches reuses the slots from the ninth on: every part of a branch (bullets, line, arrows, label) takes the same slot, where v12's redux themes cycled the labels over twelve | D267 |
| `cScale0`–`cScale11`, `cScaleInv0`–`cScaleInv11`, `cScaleLabel0`–`cScaleLabel11` | Three palettes, `cScale`, `cScaleInv` and `cScaleLabel`, with v12's values in every theme, derived as v12 derives them: they follow `primaryColor` (and the secondary and tertiary colours) where v12's theme does (`base`, `forest`, `dark` slot 0, `neo-dark`, `redux-dark`; `mainBkg` in `redux`), the darker steps under `darkMode`, and an override of one slot or of the whole list (`cScale: [...]`). A `cScaleInv` or `cScaleLabel` slot that v12 derived from the `cScale` slot follows its override as in v12. `THEME_COLOR_LIMIT` is ignored: twelve slots, cycling. The labels read v12's `scaleLabelColor`, a shared label ink, so setting it recolours them as in v12; `labelTextColor` and `actorTextColor` are sequence's own and no longer reach `cScaleLabel` (D334), so set `scaleLabelColor` or `cScaleLabel` instead. Under `darkMode`, v12 also turned the unset text colour of `base`, `neo`, `redux` and `redux-color` to `#eee`, which their labels followed; v13 keeps the theme's `scaleLabelColor`. The timeline paints with them only in the classic themes, and with `cScaleLabel` in the neo themes ([Timeline config](#timeline-config)) | D258, D334 |
| `cScaleLabel` in `redux-dark` | v12's `#e0dfdf` where it reads on the slot's fill (4.5:1), else black where black reads better. With the theme's own values only slot 8 changes: its light grey `#c0bfbe` fill had `#e0dfdf` text at 1.38:1, and now has black at 11.44:1. Every other slot keeps `#e0dfdf` on black (15.79:1), and under `darkMode` (slot 8 `#41403f`) nothing changes. The rule also applies to an author's `scaleLabelColor` or `cScale<n>`: an ink that fails on its fill turns black when black reads better. An author's `cScaleLabel<n>` is drawn as given. The fills keep v12's values (D258). `neo-dark` keeps v12's labels: its mindmap and timeline draw them on `mainBkg` under the gradient, not on the `cScale` fill | D544 |

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
| `erEdgeLabelBackground` (ER relationship labels) | white (`redux-color`), `#16141f` (`redux-dark-color`); `edgeLabelBackground` in `redux`, `redux-dark`, `neo` and `neo-dark` | `edgeLabelBackground` |
| `erMarkerFill` (ER zero circles) | `mainBkg` | white |
| `compositeBackground` (state) | `background`; `#16141f` on `redux-dark` and `redux-dark-color` | `background` |
| `compositeTitleBackground` (state) | `#f9f9fb`; `#16141f` on `redux-dark` and `redux-dark-color`; `mainBkg` on `neo` and `neo-dark` | `mainBkg` |
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
lifted 0.01 so they take the gradient (v12 0.001) (D185).
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
  are solid.
- **What is sketched (D301):** flowchart (node shapes, their inner lines, subgraphs, the
  collapsed card, edges), class (class boxes, dividers, notes, namespaces, relations), state
  (states, composites, notes, start and end, choice, fork and join, region dividers,
  transitions), ER (entities, attribute rows, dividers, subgraphs, relationship lines),
  mindmap (every node shape, the rule under a plain node, edges) and kanban (columns and cards;
  the priority bar is kept, D379). v12 did not sketch mindmap's plain node in the classic themes;
  v13 does (D308). Arrowheads, edge-label backgrounds and text are never sketched, as in v12.
  Roughness is v12's: 0.7 for nodes, groups and marks, 0.3 for edges. State composites are drawn
  at 0.7, where v12 used roughjs's default of 1. An outline with no fill and no stroke
  (flowchart's `text` and brace hit boxes, state's region frame) stays the plain element.
- **Not sketched:** sequence, gantt, pie, timeline, journey, quadrant and gitGraph draw themselves
  and draw exactly as without the plugin, with no warning, as in v12 (D301, D305); they can opt in
  later. Types v12 sketched that v13 has not ported yet (requirement, block, swimlanes,
  venn, ishikawa, treemap, usecase, agentflow) are sketched once their ports adopt it.
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
| An unknown layout name falls back to `dagre` with a console warning | Falls back to `layered` with a `LAYOUT_UNKNOWN` warning | R-ERR-4 |
| Mindmap lays out with `cose-bilkent` (not deterministic), or `tidy-tree` with its plugin; `mindmap.layoutAlgorithm` is never read | Mindmap lays out with `tree`, core's two-sided tidy tree (loaded lazily), when no config sets `layout`. `cose-bilkent` and `tidy-tree` map to `tree` silently; `layered`, `dagre` and an installed `elk.*` are honoured; an unknown or uninstalled name draws with `tree` and warns. The mindmap key `layoutAlgorithm` is ignored | D280–D285 |
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
  themes tune eight. `sectionFills` is ignored: v12's `fillType<n>` style rules hid it in
  every theme anyway.
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

### Config

- **Honoured:** `diagramMarginX`, `diagramMarginY`, `leftMargin`, `maxLabelWidth`, `width`,
  `height`, `taskMargin`, `boxTextMargin`, `taskFontSize`, `taskFontFamily`, `actorColours`,
  `titleColor`, `titleFontFamily`, `titleFontSize`, `useMaxWidth` and `sectionColours`.
  Unset, `taskFontSize`, `taskFontFamily` and `titleFontFamily` follow the theme font, as in
  every diagram type (D132, D248), and `sectionColours` leaves names in `textColor` (D225).
- **Ignored**, accepted without a warning: `noteMargin`, `messageMargin`, `messageAlign`,
  `bottomMarginAdj`, `rightAngles`, `activationWidth` and `useWidth` (v12's journey renderer
  never read them), `boxMargin` (read only in a loop over an empty list), `textPlacement`
  (every label is SVG text, D225) and `sectionFills` (D241).
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

- `fillType0`–`fillType7` are each theme's v12 values, written into the theme. v12 derived
  them from `primaryColor` and `secondaryColor` with hue turns of ±64° and 128°, so a custom
  `primaryColor` recoloured every section. In v13 it does not, except on `base`, where
  `fillType0` and `fillType1` follow `primaryColor` and `secondaryColor` while
  `fillType2`–`fillType7` keep base's v12 values. Set `fillType<n>` to recolour a section.
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
| Labels: an HTML `<div>` in `<foreignObject>` (`textPlacement: fo`) or `<tspan>`s, `<br>` literal in the HTML and a hyphen at each split word in the legend | `<text>`/`<tspan>` from core's label layout: task names wrap to the task, section names to the band, legend names to `maxLabelWidth`, `<br>` breaks, long words split without a hyphen; `textPlacement` is ignored | D225 |
| Colours from the `<style>`: `.task-type-<n>, .section-type-<n> { fill: fillType<n> }` (every rule gated on `fillType0`), `line { stroke: textColor }`, `.face { fill: faceColor or #FFF8DC; stroke: #999 }`, `.legend { fill: textColor }`, `.actor-<n> { fill: actor<n> }`; `#666` outlines, eyes and mouth, `#000` dot outlines | Presentation attributes: band and task fills from `fillType<slot>`, lines, arrowhead, legend and names from `textColor`, the face from `faceColor`, dots from `journey.actorColours` unless the author sets `actor<n>` (n < 6); `#666`, `#999` and `#000` stay constants in every theme | No style sheet (R-SEC-2); D152, D245, D249 |
| `sectionColours` reached the `tspan` fallback only (the default `fo` label ignored it) | Colours section and task names, by band, when set; otherwise names are `textColor` | D225 |
| Title: an unclassed bold `<text>` at (`leftMargin`, 25) with `fill="<titleColor>"` (default empty: black on dark themes) and `font-family="<titleFontFamily>"` | `<text class="journey-title">` at the same place, bold, `4ex` of the theme `fontSize` by default, in `titleColor` or else `textColor`; `titleFontFamily` inherits the Mermaid font when unset | D248 |
| Task text in `taskFontSize`/`taskFontFamily` (defaults 14 and Open Sans) via an inline `style` | Unset, both follow the theme font; when set, `font-family`/`font-size` are written on the `sections` and `tasks` groups | Fonts are uniform across diagrams (D132) |
| A `journey.titleColor`, `actorColours` or `sectionColours` value that is not a colour went into the markup | Dropped with `STYLE_VALUE_DROPPED`; the default colour is used | Inert output (R-SEC-3) |

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
  fallback), `useMaxWidth` (true) and `disableMulticolor` (false). The top-level `fontSize` (16)
  is read as v12's timeline read it: each box is `0.55 × fontSize` taller than its text, and the
  TD axis starts `2 × fontSize` above the content and ends `0.5 × fontSize + 20` below it. The
  text itself is drawn at `themeVariables.fontSize`, as in v12. A `leftMargin`, `padding` or
  `fontSize` that is not a number of at least 0 is replaced by its default, with a
  `TIMELINE_CONFIG_IGNORED` warning naming the key.
- **Ignored**, as v12's timeline never read them (keys copied from the sequence config):
  `diagramMarginX`, `diagramMarginY`, `width`, `height`, `boxMargin`, `boxTextMargin`,
  `noteMargin`, `messageMargin`, `messageAlign`, `bottomMarginAdj`, `rightAngles`,
  `taskFontSize`, `taskFontFamily`, `taskMargin`, `activationWidth`, `textPlacement`,
  `actorColours`, `sectionFills`, `sectionColours` and `useWidth`. Box colours come from the
  `cScale`, `cScaleInv` and `cScaleLabel` palettes or `mainBkg` / `nodeBorder` (D258).
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
  never matched, so `padding` sized classic circles there too and does here. `maxNodeWidth` wraps every shape: v12 wrapped square, rounded
  and hexagon nodes at `flowchart.wrappingWidth` instead (both 200 by default, so nothing changes
  unless one of them is set). A `padding` below 0, a `maxNodeWidth` of 0 or less or a value that
  is not a number lays out with the default and warns `MINDMAP_CONFIG_IGNORED`; numeric strings
  (`"20"`, not `"20px"`) are read as numbers, as in v12. `useWidth` and `layoutAlgorithm` are ignored (v12 never
  read them), and `look` is ignored as everywhere (D153), except that `look: handDrawn` sketches
  the mindmap when `@mermaid-js/plugin-hand-drawn` is installed
  ([Hand-drawn look](#hand-drawn-look)). `mindmap.layout` picks the engine for mindmaps and wins
  over the top-level `layout`, with the same names and fallbacks.
- **Labels** are SVG text, measured in the theme's font, with every label markdown as in v12
  (bold, italic, `<br>` line breaks), instead of HTML in `<foreignObject>`
  ([Mindmap SVG structure](#mindmap-svg-structure)).
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
| Label `<text dy="1em" dominant-baseline="middle">` wrapped by `getComputedTextLength`; only lowercase `<br>` breaks | `<text data-id>` with a `<tspan>` per line from core's label layout. Labels stay plain text, as in v12: every `<br>` form breaks and entities decode (D225), and any other markup (`<b>`, `<i>`, `<u>`) is shown as written. Labels carry `data-id` only. Box labels are drawn at the theme's `fontWeight` (600 in the redux themes, as v12's redux CSS did) | D225, R-PARSE-8 |
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
  ([theme-variables.md](./theme-variables.md)). Slots v12 derives by lightness alone follow the
  theme's base colours; hue-turned and `cScale` slots are fixed values (but forest's `pie6`, below), so in `redux-color` and
  `redux-dark-color` a `cScale<n>` override no longer recolours `pie<n+1>` (set `pie<n+1>`).
  `pieOpacity` is a number from 0 to 1 (D221); any other value is dropped with
  `THEME_VARIABLE_DROPPED`.
- **`dark` slot 12 (D228):** `dark` and `neutral` keep v12's `cScale` offset (slice *n* takes
  `cScale`*n*, so the first slice is `cScale1`). v12 `dark` left `pie12` unset, so a twelfth
  slice drew black; it is now `cScale0`, as in `neutral`.
- **Rounding artefacts (D333(a)).** Where v12 stepped a slot from its unrounded HSL base colour,
  which lands a few steps off the hex one, v13 derives the slot from the theme's hex base colour
  by v12's own formula, so it also follows that base colour's override:

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
| The viewBox widened only for the title; many sections or a wide `top`/`bottom` legend were clipped | The viewBox covers everything drawn, and may start at a negative `x` or `y` | D224 |
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

v12 read `themeVariables.packet` (`startByteColor` … `blockFillColor`). v13 keeps that nested
object and adds a flat name for each key (`packetStartByteColor` … `packetBlockStrokeWidth`, CSS
`--mermaid-packetStartByteColor`, …); the flat name wins when both are set (D335, D540). An
author's value wins in every theme, as in v12, and a nested key leaves the others on the
theme's values. The lengths (10, 12 and 14 px, stroke 1) and the colours in `default`,
`neutral`, `base`, `dark`, `neo`, `redux` and `redux-color` are v12's. What changed
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
| A label wider than its field ran over its neighbours | It shrinks to fit (its own `font-size`), down to the bit-number size (10 px), then overflows as in v12; each piece of a split field fits its own label | D343 |
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
| Quadrant fills 2–4 derived from `primaryColor` (or `#ECECFE` in `redux`, `redux-color` and `neo`) | Derived from `quadrant1Fill`, which is `primaryColor` (`#ececfe` in those three): the same colours unless an author sets `quadrant1Fill` alone, which now moves 2–4 too. `default` also follows an author `primaryColor`, `primaryTextColor` and `primaryBorderColor`, which v12's `theme-default.js` ignored for the quadrant fills, text fills and borders (it derived them once, in its constructor, before the overrides) | D232 |
| A point whose coordinate lexed but was not a number in [0, 1] (`0x5`, `0a5`) was drawn off the chart or at `NaN` | Left out, with one `QUADRANT_POINT_INVALID` warning per point | D226 |
| `look: neo` changed nothing in a quadrant chart | Every theme family draws it plain, without gradient, shadow or palette; families differ by colour only | D227 |
| Border lines in v12's khroma `primaryBorderColor` | Core's `primaryBorderColor`, the border colour of every other type, so some themes change (table below) | R-THEME-11 |
| `themeVariables.darkMode: true` switched `primaryTextColor` and `textColor` to `#eee` in `redux`, `redux-color`, `base` and `neo`, and so every quadrant text | Core's theme specs keep their text colours under `darkMode`, so quadrant text does too. This is core behaviour for every type, not a quadrant change | Core |

Quadrant border colours (`quadrantExternalBorderStrokeFill` and `quadrantInternalBorderStrokeFill`)
where v12 and v13 differ; the other themes keep v12's colour.

| Theme | v12 | v13 |
| --- | --- | --- |
| `default` | `#c7c7f1` | `#c9c9d9` |
| `dark` | `#cccccc` | `#4c4d4d` |
| `forest` | `#abb594` | `#aec281` |
| `neutral` | `#d4d4d4` | `#cacaca` |
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
  plain text (D268): `$$…$$` and `fa:` stay as written, as in v12.
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
| Text set with d3 `.text()` after the DB's `&lt;`, `&gt;`, `&equals;`; branch names split on `\n` and `<br>` into `tspan.row` with `dy="1em"` | Each label is one `<text>` start-anchored where the layout measured it, in the font it measured; a branch name's lines are `<tspan x y>`. Ids, tags and names are drawn as written and escaped by the writer, a branch name breaks only on a newline, and `$$…$$` or `fa:` stays as written | D263, D268 |
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
- **Warnings (D276):** unknown `after`/`until`/`click` ids (`GANTT_UNKNOWN_TASK`; a click names
  only a task written before it, as v12 bound it while reading the line) and data that
  is neither a date nor a duration (`GANTT_BAD_DURATION`), one each per render, where v12 only
  logged. Also new: `GANTT_TICK_INTERVAL_IGNORED` (a `tickInterval` that would draw more than
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
| Tick text `fill="#000"` `stroke="none"` `font-size="10"`, overridden by `.grid .tick text { fill: textColor }`; d3's tick lines `stroke="currentColor"` (the page's colour, as v12's `.grid .tick { stroke: gridColor }` matched only the group); d3's axis path, hidden by `.grid path { stroke-width: 0 }`; `shape-rendering: crispEdges` on ticks and `doneCrit` bars | Tick text in `textColor` at 10px; tick lines in `gridColor` at v12's 0.8 opacity; no axis path; no `shape-rendering` | What v12's CSS meant; `shape-rendering` is not an allowed attribute |
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
  italic text and ticket links are dropped with one `ASCII_DROPPED` warning each (`style`,
  `emphasis`, `link`); a board wider than `ascii.maxWidth` is not folded and adds
  `ASCII_TOO_WIDE` ([ASCII output](./ascii.md#kanban-boards)).
- **Syntax** is v12's: a differential test runs v12 and v13 over every e2e fixture and the v12
  spec and docs examples, and the grammar is in [syntax/kanban.md](./syntax/kanban.md). Every
  error is reported, not only the first, with messages in words (R-PARSE-4). As in v12, an item
  indented less than the first column is an error once another item follows it (the message
  starts with v12's `Items without section detected`), and so is an item whose text starts with
  the word `kanban` in any case. Errors v12 raised as a `TypeError` or not at all are now
  diagnostics with a range: an `::icon()` or `:::` line before any item, shape data that is
  empty or `null` (`@{ }`), and a `shape` that is not a lower-case string (`shape: 5`). Every
  label is markdown, as in v12.
- **Columns that share an id** (D373): v12 listed the cards of every column with that id under
  each of them, so two `docs` columns both drew both columns' cards. A card now belongs to the
  column it follows. Repeated ids are allowed for columns and cards alike.
- **Labels** (D372) are SVG text from core's label layout, measured in the theme's font, instead
  of HTML in `<foreignObject>`: `**bold**`, `<br>`, entities, math and `fa:` icons work in column
  titles, card titles, tickets and assignees. Column titles wrap at `sectionWidth` and card
  labels 25 px inside it, as in v12; a single word wider than that stays whole and overflows the
  column or card, as in v12 (earlier v13 builds split it between characters; the text output
  still does, to keep it in its box). A raw line break inside a quoted label breaks the line,
  where v12's HTML folded it to a space.
- **Metadata v12 parsed but never drew is still not drawn** (D376), with no warning: an item's
  icon (`::icon()` or `@{ icon }`), and a column's `ticket`, `assigned` and `priority`. It stays
  in the model and the AST.
- **Priority** (D375): `Very High`, `High`, `Low` and `Very Low`, matched exactly, draw v12's
  bar in `red`, `orange`, `blue` and `lightblue` in every theme. Anything else draws no bar
  (v12 drew one with no stroke), and one `KANBAN_PRIORITY` warning per render names the card
  values that are none of those four nor `Medium`.
- **Ticket links** (D377) pass the link check, and a refused URL draws the ticket as plain text
  with a `URL_REFUSED` warning; the first `#TICKET#` is replaced with the ticket taken literally
  ([Kanban SVG structure](#kanban-svg-structure)).
- **Column colours** (D374) come from the `cScale` palette in every theme, lightened by 10 or
  darkened under a dark theme, and cycle through the twelve slots, so v12's black columns past
  the tenth are gone and `neo-dark` darkens where v12 left it light
  ([Kanban SVG structure](#kanban-svg-structure)).
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
| Labels: markdown HTML in `<foreignObject>`, wrapped by the browser; a raw line break in a quoted label folded to a space | `<text>`/`<tspan>` from core's label layout with markdown on, for all four kinds: `**bold**`, `<br>`, entities, math and `fa:` icons work; titles wrap at the column width `W` (columns) and `W − 25` (cards, tickets and assignees); a raw line break in a quoted label breaks the line | R-TEXT-1, D372 |
| Ticket link: `xlink:href` set to `ticketBaseUrl.replace('#TICKET#', ticket)` (so `$&` in a ticket expanded to the match), `target="_blank"`, no check (only DOMPurify removed a `javascript:` URL); underlined by `.kanban-ticket-link` in the `<style>` | `<a class="kanban-ticket-link" href target="_blank" rel="noopener noreferrer" text-decoration="underline">`. The first `#TICKET#` is replaced with the ticket taken literally (`$&` stays `$&`), not percent-encoded, and the URL passes the link check (`securityLevel`, `linkSchemes`). A refused URL draws the ticket as plain text with one `URL_REFUSED` warning. No link without a ticket or a `ticketBaseUrl` | R-SEC-4, R-SEC-6, R-SVG-4, D377 |
| Priority: a 4 px line in `red`, `orange`, `blue` or `lightblue` for `Very High`, `High`, `Low`, `Very Low` (exact case); `Medium`, any other value and a non-string drew the line with no stroke (invisible) | The same four colours, in every theme; anything else draws no line. One `KANBAN_PRIORITY` warning per render names each card value that is none of the four nor `Medium` (a non-string is never one of them), with the cards' AST ids. A column's priority is not drawn or checked | D375, D376 |
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
| `look: neo` and the redux themes: the same chart as the classic themes | The same: radar differs between families by colour only (computed styles checked in `neo` and `neo-dark`) | D227 |

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
| A fixed `viewBox="0 0 width+2·padding height+2·padding"`: a fifth quadrant item, confusion items below the ellipse, a wide title or one in a `padding` under about 18 ran off it | The same placement (D361); the `viewBox` (and `max-width`, or `width`/`height` with `useMaxWidth: false`) grows to cover whatever is drawn past it, so it can start below 0. A diagram where everything fits keeps v12's | D361, D224 |
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

## XY chart

The XY chart parser accepts the v12 language for `xychart` and `xychart-beta` (oracle parity over
every e2e fixture, the v12 spec strings and the syntax page; grammar in
[syntax/xychart.md](./syntax/xychart.md)), and the layout is v12's orchestrator, checked against
v12's chart builder to 0.01 px. What changes in config and drawing (spec #426):

| v12 | v13 | Why |
| --- | --- | --- |
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
| A plot written before its `x-axis` kept the x values of the axis it saw, silently; on a linear axis a category x had no position | The same, with one `XYCHART_PLOT_BEFORE_AXIS` warning naming the plots; a value with no x on the axis is drawn at the axis start, on a band and a linear axis alike | D386 |
| An unclosed `accDescr {` ended in an empty description, silently | The same, with one `XYCHART_UNCLOSED_DESCRIPTION` warning | #508 |
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
| `default` with an author `primaryTextColor` or `background` | Ignored: `default` built its `xyChart` block before the author's values were applied | The text, axis and label colours follow `primaryTextColor`, the background follows `background`, as in the other themes; an explicit `xyChart.*` value still wins | D388 |

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
| A label with `<br>` printed as one `<text>` | A `<text>` of `<tspan>`s, one per line (core's label writer); one-line text is v12's `<text>` at `translate(x,y) rotate(r)` | D385 |
| A plot whose values are all missing threw | The plot's group is written, with nothing drawn in it; a hidden axis part writes no group, an axis with every part hidden none at all | D383 |
| `look: neo` and the redux themes: the same chart as the classic themes | The same: the XY chart differs between families by colour only | D227 |
