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
| Relationship and note lines were always drawn as one fixed curve; no curve key | Unset, the same S-curves. The new `usecase.curve`, then the new top-level `curve`, set them with `flowchart.curve`'s names (`linear`, `step`, `rounded`, …), and the layout routes the lines to match; a line from a node to itself stays rounded, and text output keeps its right angles. An unknown name draws `rounded` with one `CURVE_UNKNOWN` warning | D733 |
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
