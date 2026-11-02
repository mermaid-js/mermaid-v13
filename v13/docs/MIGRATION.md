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
6. The default theme is `redux` and the default layout is `layered`; set `theme: 'default'` to
   keep v12 colours ([Changed defaults](#changed-defaults)).
7. Render errors are thrown as `MermaidError`; nothing is drawn into the page for you
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
| `render(id)` sets the root `<svg id>` | `id` prefixes the ids the output writes (`<id>-title`, `<id>-desc`); the root has no `id` | Ids stay unique per render |
| `render()` needs a browser DOM (or jsdom) to measure text | Renders in Node, Deno, workers and browsers without a DOM. Text is measured with canvas when it exists, otherwise with built-in font tables; `initialize({ deterministic: true })` always uses the tables, `initialize({ measurer })` plugs in your own | R-TEXT-4, R-ARCH-1 |
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
| `htmlLabels` | removed | Labels are SVG text only; there is no HTML label mode (D5). | none; labels support a markdown subset rendered as SVG text |
| `altFontFamily` | ignored | Unused by every renderer, also in v12. |  |
| `logLevel` | ignored | v13 does not log; problems are returned in `RenderResult.warnings`. |  |
| `arrowMarkerAbsolute` | ignored | Arrowheads are inline paths, not `<marker>` references. |  |
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
| `theme` | `"redux"` | The default changes from `default` to `redux` (D55). 13.0 ships `redux`, `default`, `dark`, `forest`, `neutral` and `base`; the other v12 names stand in for one of them with a warning, except `redux-color` (the flowchart default), which renders `redux`. |
| `layout` | `"layered"` | The default changes from `elk` to `layered`, the built-in engine (DESIGN §6.1). The v12 values `dagre`, `elk` and `elk.<algorithm>` stay valid and map to `layered` until an ELK plugin exists (R-PLUG-8); other engines come in through `registerLayoutLoaders` (R-LAYOUT-2), and an unknown name falls back to `layered` with a `LAYOUT_UNKNOWN` warning. |
| `maxEdges` | `5000` | The default changes from 500 to 5,000 (D31): one `A & … --> B & …` line multiplies edges, and v13 draws 5,000 quickly. Integrator-only; it sets the `maxEdges` render limit (R-SEC-5); an explicit `limits.maxEdges` wins. Over the limit, render() rejects with a `LIMIT` error. |
| `securityLevel` | `"default"` | The default changes from `strict` to the new level `default` (D48, D75), which keeps v12's absolute `http`/`https`/`mailto` links; `strict` now keeps relative links only, so an integrator who set `strict` explicitly loses absolute links (set `default` to keep them). `loose`, `antiscript` and `sandbox` act as `default` with a warning. |

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
| Default theme `default` | Default theme `redux` (D55). Set `theme: 'default'` for v12's default colours | D55 |
| Themes `default`, `base`, `dark`, `forest`, `neutral`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color`, `redux-dark-color`, `null` | 13.0 ships `redux`, `default`, `dark`, `forest`, `neutral` and `base`. `redux-color` (v12's flowchart default) renders `redux` silently; `redux-dark`, `redux-dark-color` and `neo-dark` render `dark`, `neo` renders `redux` and `null` renders `base`, each with a `THEME_UNAVAILABLE` warning (theme packages for them may follow, R-THEME-7). An unknown name renders `redux` with the same warning | R-THEME-6 |
| — | `theme: 'auto'`: `redux`, switching to `dark` under `prefers-color-scheme: dark` through a small custom-property `<style>` | R-THEME-8 |
| Colours computed once in JS (khroma) and written into a `<style>` element | Colours are presentation attributes reading CSS variables: every theme variable is `--mermaid-<name>` on the host page, with the theme value as fallback; derived colours use `color-mix()`. A page can re-theme rendered SVGs with CSS. `initialize({ output: { cssVariables: false } })` writes literal colours instead | R-THEME-2, R-THEME-3, R-THEME-4 |
| `themeVariables` from diagram text checked against a character set only | Values are checked by kind (colour, length, font, weight) and a bad one is dropped with `THEME_VARIABLE_DROPPED`. Names v13 does not use are ignored | R-SEC-3 |
| `themeCSS` | Ignored; see [Config behaviour](#config-behaviour) | R-SEC-2 |
| Label text colour fixed by the theme | When a `style`/`classDef` fill makes the theme's text colour unreadable, the label switches to black or white | R-THEME-12 |
| `look: neo` / `look: handDrawn` | `look` is pending: one look is drawn, with the theme's shape tokens (stroke width, corner radius, spacing). No hand-drawn strokes, gradients or drop shadows | |
| Numbered palettes (`cScale*`, `pie*`, `git*`) | Not in the 13.0 inventory; they come with the diagram types that use them | R-CONF-5 |

Colours are close to, but not byte-equal with, v12. Where a v12 colour pair failed WCAG AA
contrast, v13 changes it (for example the dark theme's `edgeLabelBackground`).

## Layout

| v12 | v13 | Why |
| --- | --- | --- |
| Default layout `elk` (12.2.0), formerly `dagre` | Default `layered`, the engine built into core | DESIGN §6.1 |
| `layout: dagre`, `layout: elk`, `elk.<algorithm>`, `flowchart-elk` header | Accepted and drawn with `layered` until an ELK plugin is registered under that name | R-PLUG-8 |
| An unknown layout name falls back to `dagre` with a console warning | Falls back to `layered` with a `LAYOUT_UNKNOWN` warning | R-ERR-4 |
| `nodeSpacing`, `rankSpacing`, `diagramPadding` | Honoured with v12's defaults (50, 50, 8) | |
| `curve` picks a d3 curve factory | The engine routes edges: `linear` draws straight segments, `step`/`stepBefore`/`stepAfter` stepped ones, `rounded` straight segments with rounded corners, every other value S-curves | |
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
