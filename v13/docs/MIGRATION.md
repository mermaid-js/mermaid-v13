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
| `mermaid@latest`, released from `develop` | Alphas are released from `mermaid-v13`, with dist-tag `v13-alpha` only, so `mermaid@latest` stays v12: install `mermaid@v13-alpha`. Public `mermaid@13.0.0-alpha.N` starts at `13.0.0-alpha.0` (D155) | R-REL-2, R-REL-3, D28, D155 |
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
| `class.look` | ignored | `look` is removed (D153): ignored, with one `LOOK_REMOVED` warning per render, whatever the diagram section. | `theme`, or the geometry and `dropShadow` theme variables |
| `class.arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
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
| `theme` | `"redux-color"` | The default changes from `default` to `redux-color`, the theme v12's flowchart renders by default (D151, amending D55). 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes, plus `default`, `dark`, `forest`, `neutral` and `base`. `neo` renders `redux-color`, `neo-dark` renders `redux-dark-color` and `null` renders `base`, each with a `THEME_UNAVAILABLE` warning. |
| `layout` | `"layered"` | The default changes from `elk` to `layered`, the built-in engine (DESIGN §6.1). The v12 values `dagre`, `elk` and `elk.<algorithm>` stay valid and map to `layered` until an ELK plugin exists (R-PLUG-8); other engines come in through `registerLayoutLoaders` (R-LAYOUT-2), and an unknown name falls back to `layered` with a `LAYOUT_UNKNOWN` warning. |
| `maxEdges` | `5000` | The default changes from 500 to 5,000 (D31): one `A & … --> B & …` line multiplies edges, and v13 draws 5,000 quickly. Integrator-only; it sets the `maxEdges` render limit (R-SEC-5); an explicit `limits.maxEdges` wins. Over the limit, render() rejects with a `LIMIT` error. |
| `securityLevel` | `"default"` | The default changes from `strict` to the new level `default` (D48, D75), which keeps v12's absolute `http`/`https`/`mailto` links; `strict` now keeps relative links only, so an integrator who set `strict` explicitly loses absolute links (set `default` to keep them). `loose`, `antiscript` and `sandbox` act as `default` with a warning. |
| `flowchart.curve` | `"rounded"` | The default changes from `basis` to `rounded`, the look of v12's default ELK layout: stepped routes whose corners are arcs of radius 5 (less on a short leg). Set `basis` to keep S-curves. `linear` draws straight segments; `step`, `stepBefore` and `stepAfter` draw stepped routes; `rounded` draws straight segments with rounded corners; every other value draws S-curves (the layout engine routes edges, not a d3 curve factory). |
| `sequence.actorFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.actorFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.noteFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.noteFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |
| `sequence.messageFontSize` |  | The default changes: unset, it is the theme's `fontSize` (16 by default), the size v12 drew, since v12 replaced every per-key size with the global `fontSize`. A set value now takes effect. |
| `sequence.messageFontFamily` |  | The default changes: unset, it is the theme's `fontFamily`, as for every diagram type, not a per-key font. A set value takes effect. |

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
  `fontSize`, so a diagram that sets none looks as before (D132).
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
| Themes `default`, `base`, `dark`, `forest`, `neutral`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color`, `redux-dark-color`, `null` | 13.0 ships the redux family (`redux`, `redux-color`, `redux-dark`, `redux-dark-color`) as real themes ported from v12, plus `default`, `dark`, `forest`, `neutral` and `base`. `neo` renders `redux-color` and `neo-dark` renders `redux-dark-color` until the neo themes are ported; `null` renders `base`. Each stand-in warns `THEME_UNAVAILABLE`. An unknown name renders the default theme with the same warning | D151, R-THEME-6, R-THEME-7 |
| — | `theme: 'auto'`: the default theme, switching to `dark` under `prefers-color-scheme: dark` through a small custom-property `<style>` | R-THEME-8 |
| Colours computed once in JS (khroma) and written into a `<style>` element | Colours are presentation attributes reading CSS variables: every theme variable is `--mermaid-<name>` on the host page, with the theme value as fallback; derived colours use `color-mix()`, and contrast text and `invert()` use relative colour syntax (`color(from …)`), so they follow a host override of the colour they derive from. A page can re-theme rendered SVGs with CSS. Limit: contrast text picks between the theme's two ink values; overriding the ink variables themselves (`--mermaid-textColor`) does not change contrast-derived text such as `nodeTextColor` (set `--mermaid-nodeTextColor` directly) `initialize({ output: { cssVariables: false } })` writes literal colours instead | R-THEME-2, R-THEME-3, R-THEME-4 |
| `themeVariables` from diagram text checked against a character set only | Values are checked by kind (colour, length, font, weight) and a bad one is dropped with `THEME_VARIABLE_DROPPED`. Names v13 does not use are ignored | R-SEC-3 |
| `themeCSS` | Ignored; see [Config behaviour](#config-behaviour) | R-SEC-2 |
| Label text colour fixed by the theme | When a `style`/`classDef` fill makes the theme's text colour unreadable, the label switches to black or white | R-THEME-12 |
| `look: neo` / `look: classic` | `look` is removed: the key is accepted and ignored, with one `LOOK_REMOVED` warning per render. What `look` switched in v12 is theme data: the redux themes carry v12's neo geometry and the classic themes (`default`, `dark`, `forest`, `neutral`, `base`) carry v12's classic geometry. For a mix, override the variables ([Theme geometry](#theme-geometry)) | D152, D153 |
| `look: handDrawn` | Ignored like any other `look`, with the same generic `LOOK_REMOVED` warning; core names no plugin. Hand-drawn strokes will come from an optional plugin, which will claim `look: handDrawn` as a legacy alias of its own key once plugins can declare config | D7, D153, R-PLUG-8 |
| Neo gradients (`useGradient`, `gradientStart`, `gradientStop`) | Not in 13.0. They come back as theme variables of the `neo` theme when it is ported | D151 |
| Drop shadow under `look: neo` | A hard drop shadow in the redux themes only, as the CSS `filter` from the `dropShadow` theme variable: offset 4px, no blur, 6% opacity, black on light themes and white on dark. It is on node outlines, icons, subgraphs and collapsed groups, not on edges, edge labels or swimlanes. The classic themes set `dropShadow: none`. No `<defs>` and no ids, so several diagrams on a page never collide | D151, D152 |
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

| Variable | Redux family (v12 neo) | Classic family (v12 classic) |
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
| `dropShadow` | `drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))`; white instead of black on `redux-dark` and `redux-dark-color` | `none` |
| `erZeroOrMoreCircleOffset` (ER, centre of a zero-or-more circle from the outline) | 28 | 30 |
| `rowOdd` / `rowEven` (ER attribute rows) | the entity fill (`mainBkg`): v12 neo leaves rows unfilled | v12's `rowOdd` / `rowEven`, the same colours (khroma's HSL lightening, D117) |
| `erEdgeLabelBackground` (ER relationship labels) | white (`redux-color`), `#16141f` (`redux-dark-color`); `edgeLabelBackground` in `redux` and `redux-dark` | `edgeLabelBackground` |
| `erMarkerFill` (ER zero circles) | `mainBkg` | white |
| `compositeBackground` (state) | `background`; `#16141f` on `redux-dark` and `redux-dark-color` | `background` |
| `compositeTitleBackground` (state) | `#f9f9fb`; `#16141f` on `redux-dark` and `redux-dark-color` | `mainBkg` |
| `altBackground` (state) | `#f9f9fb`; `#16141f` on `redux-dark` and `redux-dark-color` | `#f0f0f0` (`default`, `forest`); `#555555` (`dark`); `#f4f4f4` (`neutral`); `tertiaryColor` (`base`) |

The palette rows apply to the two colour themes only; plain `redux` and `redux-dark` carry no
palette. A padding variable (the `…Padding…` names) takes a px number or a multiple of
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

### ER diagrams

| v12 | v13 | Why |
| --- | --- | --- |
| Laid out by ELK, v12's default `layout` | Laid out by the built-in `layered` engine, like every graph diagram; `layout: elk` maps to it until an ELK plugin is registered | DESIGN §6.1, D106 |
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
- **Math** (`$$…$$`) in messages, notes, aliases, fragment and box labels is shown as written,
  with a `SEQUENCE_MATH` warning, until a math plugin exists.
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
| Composite (`roundedWithTitle`): `<g class="… statediagram-cluster" id data-look>` with `rect.outer`, `rect.inner` and an HTML `cluster-label`; old: `composit` / `alt-composit` rects and a `state-title` text | `<g class="statediagram-state statediagram-cluster [statediagram-cluster-alt] …" data-id data-ast>` with `rect.outer`, `rect.inner` and `<text class="cluster-label">` | Text labels; one element per composite |
| Concurrency region: a cluster `<g>` with a dashed `<rect class="divider">` filled `altBackground` (and the palette tint) around each region; old: a `<line class="divider">` per `--` node | Each region is `<g class="statediagram-state statediagram-cluster statediagram-region" data-ast="r:X#k">` with an `<rect class="region">` with no fill or stroke; between neighbouring regions the composite holds a dashed `<line class="divider">` from the layout's `dividers`, in the composite's border colour | Regions read as one composite split in parts; the lines come from region geometry (#144). Unfilled, with dashed dividers only (D121) |
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
