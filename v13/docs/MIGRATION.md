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

## Packages

| v12 | v13 | Why |
| --- | --- | --- |
| One `mermaid` package with every diagram type and its dependencies (d3, dagre, DOMPurify, khroma, KaTeX, …) | `mermaid` depends on `@mermaid-js/core` (pipeline, parser kit, layout, SVG writer, text, themes, config) and one `@mermaid-js/diagram-<type>` package per diagram type. `mermaid` has no other runtime dependencies | Small, DOM-free bundles (R-PERF-1, R-PERF-2) |
| ESM, IIFE (`mermaid.min.js`) and "tiny" builds | ESM only in the alpha: each package ships its compiled modules (`dist/`), Node 20 or newer. The release pipeline publishes no IIFE, `mermaid.min.js` or tiny build; bundle `mermaid` with your own bundler | |
| `mermaid@latest`, released from `develop` | Alphas are released from `mermaid-v13` on every merge, with dist-tag `alpha` only, so `mermaid@latest` stays v12: install `mermaid@alpha`. Public `mermaid@13.0.0-alpha.N` starts once M1 meets R-PERF-1…4 (until then alphas are published privately as `@mermaid-chart/*`) | R-REL-2, R-REL-3, D28 |
| `@mermaid-js/layout-elk` | No ELK package yet. `layout: elk` draws with the built-in engine ([Layout](#layout)) | R-PLUG-8 |
| ZenUML, tidy-tree and the example diagram package | Not ported in M1 | |

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
| `layout: elk` / `elk.<algorithm>` uses the ELK package | Draw with the built-in `layered` engine until an ELK plugin is registered | DESIGN §6.1 |
| `registerIconPacks(...)` | Accepted and ignored; renders carry an `ICON_PACKS_UNSUPPORTED` warning until the icons plugin exists | R-API-3 |
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

With the plugin, callbacks work as in v12. Register it once; diagram text alone can never turn
it on:

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
| `look` | ignored | `look` is removed (D153): the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. The v12 neo and classic geometry is theme data instead: the redux themes carry neo geometry and the classic themes carry classic geometry (D152). | `theme`, or the geometry and `dropShadow` theme variables; `handDrawn` comes from the hand-drawn plugin (R-PLUG-8) |
| `htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `altFontFamily` | ignored | Unused by every renderer, also in v12. |  |
| `logLevel` | ignored | v13 does not log; problems are returned in `RenderResult.warnings`. |  |
| `arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `flowchart.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render. The redux themes carry v12's `look: neo` geometry (D152). | `theme`, or the geometry and `dropShadow` theme variables |
| `flowchart.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `flowchart.htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `sequence.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `class.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `class.htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `state.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `gitGraph.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
| `dompurifyConfig` | removed | v13 has no HTML sanitizer: output is safe by construction (R-SEC-1). | none |

### Changed defaults

| Key | v13 default | Reason |
| --- | --- | --- |
| `theme` | `"redux-color"` | The default changes from `default` to `redux-color`, the theme v12's flowchart renders by default (D151, amending D55). 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes, plus `default`, `dark`, `forest`, `neutral` and `base`. `neo` renders `redux-color`, `neo-dark` renders `redux-dark-color` and `null` renders `base`, each with a `THEME_UNAVAILABLE` warning. |
| `layout` | `"layered"` | The default changes from `elk` to `layered`, the built-in engine (DESIGN §6.1). The v12 values `dagre`, `elk` and `elk.<algorithm>` stay valid and map to `layered` until an ELK plugin exists (R-PLUG-8); other engines come in through `registerLayoutLoaders` (R-LAYOUT-2), and an unknown name falls back to `layered` with a `LAYOUT_UNKNOWN` warning. |
| `maxEdges` | `5000` | The default changes from 500 to 5,000 (D31): one `A & … --> B & …` line multiplies edges, and v13 draws 5,000 quickly. Integrator-only; it sets the `maxEdges` render limit (R-SEC-5); an explicit `limits.maxEdges` wins. Over the limit, render() rejects with a `LIMIT` error. |
| `securityLevel` | `"default"` | The default changes from `strict` to the new level `default` (D48, D75), which keeps v12's absolute `http`/`https`/`mailto` links; `strict` now keeps relative links only, so an integrator who set `strict` explicitly loses absolute links (set `default` to keep them). `loose`, `antiscript` and `sandbox` act as `default` with a warning. |
| `flowchart.curve` | `"rounded"` | The default changes from `basis` to `rounded`, the look of v12's default ELK layout: stepped routes whose corners are arcs of radius 5 (less on a short leg). Set `basis` to keep S-curves. `linear` draws straight segments; `step`, `stepBefore` and `stepAfter` draw stepped routes; `rounded` draws straight segments with rounded corners; every other value draws S-curves (the layout engine routes edges, not a d3 curve factory). |

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

## Themes

| v12 | v13 | Why |
| --- | --- | --- |
| Default theme `default` (the flowchart section defaults to `redux-color` with `look: neo`) | Default theme `redux-color` for every diagram type, with v12's `look: neo` geometry. Set `theme: 'default'` for v12's default colours and classic geometry | D151 |
| Themes `default`, `base`, `dark`, `forest`, `neutral`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color`, `redux-dark-color`, `null` | 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes ported from v12, plus `default`, `dark`, `forest`, `neutral` and `base`. `neo` renders `redux-color` and `neo-dark` renders `redux-dark-color` until the neo themes are ported; `null` renders `base`. Each stand-in warns `THEME_UNAVAILABLE`. An unknown name renders the default theme with the same warning | D151, R-THEME-6, R-THEME-7 |
| — | `theme: 'auto'`: the default theme, switching to `dark` under `prefers-color-scheme: dark` through a small custom-property `<style>` | R-THEME-8 |
| Colours computed once in JS (khroma) and written into a `<style>` element | Colours are presentation attributes reading CSS variables: every theme variable is `--mermaid-<name>` on the host page, with the theme value as fallback; derived colours use `color-mix()`, and contrast text and `invert()` use relative colour syntax (`color(from …)`), so they follow a host override of the colour they derive from. A page can re-theme rendered SVGs with CSS. Limit: contrast text picks between the theme's two ink values; overriding the ink variables themselves (`--mermaid-textColor`) does not change contrast-derived text such as `nodeTextColor` (set `--mermaid-nodeTextColor` directly) `initialize({ output: { cssVariables: false } })` writes literal colours instead | R-THEME-2, R-THEME-3, R-THEME-4 |
| `themeVariables` from diagram text checked against a character set only | Values are checked by kind (colour, length, font, weight) and a bad one is dropped with `THEME_VARIABLE_DROPPED`. Names v13 does not use are ignored | R-SEC-3 |
| `themeCSS` | Ignored; see [Config behaviour](#config-behaviour) | R-SEC-2 |
| Label text colour fixed by the theme | When a `style`/`classDef` fill makes the theme's text colour unreadable, the label switches to black or white | R-THEME-12 |
| `look: neo` / `look: classic` | `look` is removed: the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. What `look` switched in v12 is theme data: the redux themes carry v12's neo geometry and the classic themes (`default`, `dark`, `forest`, `neutral`, `base`) carry v12's classic geometry. For a mix, override the variables ([Theme geometry](#theme-geometry)) | D152, D153 |
| `look: handDrawn` | Ignored with a warning that the hand-drawn plugin is not installed; hand-drawn strokes come from that optional plugin | D7, D153, R-PLUG-8 |
| Neo gradients (`useGradient`, `gradientStart`, `gradientStop`) | Not in 13.0. They come back as theme variables of the `neo` theme when it is ported | D151 |
| Drop shadow under `look: neo` | A hard drop shadow in the redux themes only, as the CSS `filter` from the `dropShadow` theme variable: offset 4px, no blur, 6% opacity, black on light themes and white on dark. It is on node outlines, icons, subgraphs and collapsed groups, not on edges, edge labels or swimlanes. The classic themes set `dropShadow: none`. No `<defs>` and no ids, so several diagrams on a page never collide | D151, D152 |
| Per-subgraph colour in `redux-color` | Each subgraph takes a palette slot by declaration order, cycling after twelve: border from `borderColorArray`, fill from `bkgColorArray`. `redux-dark-color` has an empty fill palette, so its subgraphs are coloured on the border only. `redux` and the classic themes carry no palette | D151 |
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

| Variable | Redux family (v12 neo) | Classic family (v12 classic) |
| --- | --- | --- |
| `borderColorArray` | Tailwind-400 × 12 (`redux-color`, `redux-dark-color`) | none |
| `bkgColorArray` | Tailwind-50 × 12 (`redux-color`); empty (`redux-dark-color`) | none |
| `arrowheadGap` (point) | 4 | 0 |
| `arrowheadLength` / `arrowheadWidth` (point) | 10.5 / ≈12.8 | 8 / 8 |
| `circleArrowheadSize` / `circleArrowheadGap` | 14 / ≈3.15 | 11 / ≈1.1 |
| `crossArrowheadSize` / `crossArrowheadGap` / `crossArrowheadStrokeWidth` | 12 / ≈2.96 / 2.5 | 11 / ≈2 / 2 |
| `nodePaddingX` / `nodePaddingY` (per side) | 16 / 12 | 2 × padding / padding (30 / 15 at the default) |
| `stadiumPaddingX` / `stadiumPaddingY` (totals) | 40 / 24 | padding |
| `hexagonPaddingX` / `hexagonPaddingY`; `hexagonSlant` | 70 / 32; 3.5 | padding; 4 |
| `doubleCircleGap` / `doubleCirclePadding` | 12 / 16 | 5 / padding |
| `circlePadding` / `circleMinDiameter` | 16 / 44 (v13's earlier values, kept) | padding / none |
| `dropShadow` | `drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))`; white instead of black on `redux-dark` and `redux-dark-color` | `none` |

The palette rows apply to the two colour themes only; plain `redux` and `redux-dark` carry no
palette.

- **Arrowheads** stop `arrowheadGap` short of the node outline, so in the redux themes a 4px gap
  separates the tip from the node, as in v12 neo. They stay inline paths with no `<marker>`;
  v12's `refX` and `stroke-dasharray` mechanism is not needed, and dashed and dotted edges look
  the same as in v12.
- **Hexagon padding axes are corrected.** v12 adds the X padding to the height and the Y padding
  to the width; v13 applies X to the width and Y to the height, so a hexagon in a redux theme is
  wider and less tall than in v12 (D151).
- **Circle padding stays as in v13** in the redux themes (16, minimum diameter 44), instead of
  v12 neo's values, so circles do not grow (D151).
- **Diamonds** are the v12 square rhombus in every theme, with side = label width + label
  height + 2 × padding. Being the same everywhere, the diamond has no theme variable.
- **Collapsed subgraphs** are drawn as in v12 in every theme: a rounded card, a dashed separator
  and three dots.

## Layout

| v12 | v13 | Why |
| --- | --- | --- |
| Default layout `elk` (12.2.0), formerly `dagre` | Default `layered`, the engine built into core | DESIGN §6.1 |
| `layout: dagre`, `layout: elk`, `elk.<algorithm>`, `flowchart-elk` header | Accepted and drawn with `layered` until an ELK plugin is registered under that name | R-PLUG-8 |
| An unknown layout name falls back to `dagre` with a console warning | Falls back to `layered` with a `LAYOUT_UNKNOWN` warning | R-ERR-4 |
| `nodeSpacing`, `rankSpacing`, `diagramPadding` | Honoured with v12's defaults (50, 50, 8) | |
| `curve` picks a d3 curve factory | The engine routes edges: `linear` draws straight segments, `step`/`stepBefore`/`stepAfter` stepped ones, `rounded` (the default) straight segments joined by arcs of radius 5, every other value S-curves | |
| dagre adds 25 px of rank spacing inside subgraphs | Not reproduced: subgraphs are slightly more compact | |

Node positions differ from v12's dagre and ELK output; layouts are deterministic for the same
input.

## Labels and text

| v12 | v13 | Why |
| --- | --- | --- |
| HTML labels in `<foreignObject>` (`htmlLabels: true`) or SVG text | SVG `<text>`/`<tspan>` only | D5 |
| Any HTML in labels, sanitised by DOMPurify | `<b>`/`<strong>` and `<i>`/`<em>` are drawn bold and italic, `<br>` breaks the line. Other HTML element tags are dropped and their text kept (`<img>` draws nothing, `<a>` is not a link, `<sub>`/`<sup>`/`<u>` draw plain text). Text that only looks like a tag, such as `List<T>`, is shown as written | R-TEXT-3 |
| Markdown strings (`` "`**bold**`" ``) | Same subset: `**`/`__` bold, `*`/`_` italic, `` `code` `` (monospace), `- ` and `* ` bullet lists (one nesting level), backslash escapes, `<br>` and newlines | R-TEXT-2 |
| Entities: Mermaid's `#quot;`/`#35;` and HTML `&…;` | Both decoded; about 45 named HTML entities plus numeric ones. Unknown entities stay literal | |
| KaTeX math (`$$…$$`) | Not rendered in M1 (`legacyMathML` and `forceLegacyMathML` are pending); math comes back as an optional plugin emitting SVG | D5 |
| Text measured by the browser | Measured by canvas when present, else by built-in tables for Trebuchet MS, Verdana and Arial; line height comes from the font, so labels are not pixel-equal with v12 | R-TEXT-4 |
| Labels wrap at `flowchart.wrappingWidth` (HTML labels) | Node labels, plain and markdown alike, wrap at `wrappingWidth` (120) and are widened to `minNodeWidth` (120), except circles; edge labels wrap at 200. CJK text breaks between characters, and a word wider than the box is split | |

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
  `kanbanItem`, mindmap shapes) draw as a rectangle. Icon shapes draw their frame only, with an
  `ICON_UNAVAILABLE` warning, until the icons plugin exists.
- **Step animation** (`step` on edges, `flowchart.stepNumbers`, `flowchart.stepDuration`) and
  edge `animate`/`animation` are parsed but not drawn.
- **`style`, `classDef` and `linkStyle`** go through a per-property allow-list; an unknown
  property or unsafe value (`url(`, `expression(`, `javascript:`, `@import`, …) is dropped with
  `STYLE_PROPERTY_DROPPED` or `STYLE_VALUE_DROPPED`. `color` sets the label's fill.
- **`maxEdges`** (default 5,000; v12 had 500) is still the edge limit; going over it fails
  with a `LIMIT` error. See Limits under Public API.

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
