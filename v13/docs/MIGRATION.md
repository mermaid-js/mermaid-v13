# Migrating from Mermaid v12 to v13

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

## Public API

`render`, `parse`, `initialize` and `run` keep their v12 call signatures (R-COMPAT-5); a type
test checks them against the mermaid@12 declarations.

| v12 | v13 | Why |
| --- | --- | --- |
| `mermaidAPI` object (`getConfig`, `setConfig`, `reset`, …) | Removed | No global render state (R-API-5); config goes through `initialize()` |
| `render(id, text, container?)` → `{ svg, diagramType, bindFunctions? }` | Same call; the result adds `width`, `height` and `warnings`. `container` is accepted and ignored (v13 measures without the DOM) | R-API-1, R-ERR-4 |
| `render(id)` sets the root `<svg id>` | `id` prefixes the ids the output writes (`<id>-title`, `<id>-desc`); the root has no `id` | Ids stay unique per render |
| Errors are `Error`s with jison text (`Parse error on line 3 … Expecting 'SQE'`) and `hash.loc` | `MermaidError { code, message, line, column, offset, length, expected?, diagnostics }`; `code` is `SYNTAX`, `SEMANTIC`, `UNSUPPORTED_DIAGRAM`, `UNSUPPORTED_FORMAT`, `NOT_LOADED`, `LIMIT` or `INTERNAL`; lines count from the top of the source, front matter included | R-ERR-1, R-ERR-2, D68 |
| A diagram type without a renderer, or unknown text, throws `UnknownDiagramError` | `MermaidError` with `code: 'UNSUPPORTED_DIAGRAM'` (every v12 type is still detected, in v12 order) | R-COMPAT-7 |
| `detectType(text)` throws `UnknownDiagramError` | Throws `MermaidError` (`UNSUPPORTED_DIAGRAM`) | R-ERR-1 |
| `parse()` → `{ diagramType, config }` | Adds `warnings`; `config` (front matter and directives) leaves out the integrator-only keys | R-SEC-5 |
| Logging to the console | Nothing is written to the console; warnings are in `RenderResult.warnings` | R-ERR-4 |
| — | New: `prepare(text)` + `renderSync(text, options)`, `preload({ types, layouts, themes })`, `supportsFormat(type, format)`, `createMermaid()` (an API object with its own registry and defaults) | R-API-2, R-ASCII-5 |
| `registerLayoutLoaders([{ name, loader, algorithm? }])` where the loader returns a DOM renderer | `registerLayoutLoaders([{ name, loader }])` where the loader returns a layout engine `(graph, ctx?) → LayoutModel`; selected with `layout:` | R-LAYOUT-2 |
| `layout: elk` / `elk.<algorithm>` uses the ELK package | Draw with the built-in `layered` engine until an ELK plugin is registered | DESIGN §6.1 |
| `registerIconPacks(...)` | Accepted and ignored; renders carry an `ICON_PACKS_UNSUPPORTED` warning until the icons plugin exists | R-API-3 |
| `setParseErrorHandler(fn)` gets the raw error | Deprecated; `fn` gets the `MermaidError` of a failed `parse()` | R-API-4 |
| `initialize()` replaces the site config | Same: it swaps in a new frozen defaults object; renders already started keep the old one | R-ARCH-4, D72 |
| Integrator options beyond the schema | `initialize()` also takes `measurer`, `deterministic`, `linkSchemes`, `output.cssVariables` and `limits`; diagram text can never set them | R-SEC-5, R-SEC-6 |
| Text over `maxTextSize` renders a "Maximum text size in diagram exceeded" placeholder diagram; over `maxEdges` throws an `Error` | Both reject with `MermaidError { code: 'LIMIT' }`, as do the new caps below | R-SEC-5, D31 |

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

### securityLevel

`securityLevel` has two levels (D48, D75). The new default, `default`, keeps `http`, `https`,
`mailto` and relative link URLs, which is what v12's default `strict` kept. **`strict` now keeps
relative links only**: an integrator who set `securityLevel: 'strict'` explicitly loses absolute
links and gets a `URL_REFUSED` warning per dropped link. Set `securityLevel: 'default'` (or
leave it unset) to keep them. `loose`, `antiscript` and `sandbox` act as `default` with a
`SECURITY_LEVEL` warning; there is no sandbox iframe mode and no HTML in labels.
