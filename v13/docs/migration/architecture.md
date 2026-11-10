## Architecture diagram

What changes in how an architecture diagram is drawn, against v12 12.2.0
(`architectureRenderer.ts`, `svgDraw.ts`, `architectureIcons.ts`, `architectureStyles.ts`), and
why (spec #525). The layout itself is `compass` (D326).

| v12 | v13 | Why |
| --- | --- | --- |
| The seven built-in icons (`database`, `server`, `disk`, `internet`, `cloud`, `blank`, `unknown`) were an icon pack, `mermaid-architecture`, registered globally when the diagram loaded | The package draws them itself, in v12's look (80 × 80 `#087ebf` squares with white strokes, scaled to `architecture.iconSize`), the same in every theme, with no extension | D505, D152 |
| An icon name that resolved nowhere drew a blue square with a white `?` and logged an error | The same `?` square, and one `ICON_NOT_RENDERED` warning per render naming each such icon. A name without a pack prefix is never looked up anywhere but the built-ins, as v12 looked it up only in its own pack | D505, D291 |
| A pack icon (`logos:aws`) came from a pack registered with `registerIconPacks` | It comes from the icons extension (`@mermaid-js/plugin-icons`) with that pack, which the diagram asks for by name (`icons()`); without one the `?` square and `ICON_NOT_RENDERED`. Gradients and other parts an icon body may not hold are simplified, with `ICON_SIMPLIFIED`. While the pack is still loading the icon's square is left empty | D505, D293, D295, D299 |
| A text icon (`service a "text"`) was an HTML `<div>` in a `foreignObject`, left-aligned, cut to `(iconSize − 2) / fontSize` lines by `-webkit-line-clamp` | SVG text from core's label layout, in white, centred in the `blank` square, wrapped to the square less v12's 1 px margin, cut to the lines that fit, the last ending in `…` where text was cut | D506, R-SEC-2 |
| Every edge was a straight line or one bend through cytoscape's midpoint | The same wherever the route has at most one bend. A route that needs more (two ends on one side, an edge from a node to itself, a detour round another node) is `compass`'s orthogonal route, with square corners | D507 |
| Edge labels: along a level line under its midpoint, wrapped to its length; turned −90° beside a vertical line, wrapped to two thirds of it; turned ±45° inside a bend, wrapped to half its width | The same placement. On a route with more than one bend the label is flat, unwrapped, where `compass` left room for it | D507 |
| `architecture.fontSize` sized cytoscape's own label style and moved a group's title by half of it | Every label is drawn in the theme's `fontSize` (as v12 drew the text), and the group title sits in the title band `compass` placed | D507 |
| A service's label hung from the icon's bottom, its first line's middle 1em below it | The label's box starts at the icon's bottom, as `compass` sized the service (the icon with its label under it), a few px higher | D501 |
| An edge with two arrowheads (`<-->`) between nodes closer than the two heads drew them over each other (a large `iconSize`: the heads are `iconSize / 6`) | Both heads shrink to half the line, with one `ARCHITECTURE_ARROW_SHRUNK` warning. Never at the default sizes | GAPS #607 |
| `base` drew edges and arrowheads `#777` and group borders `#000`, literals no other theme had | `base` takes the rule every other theme follows: edges in `lineColor`, borders in v12's group border (below) | D541 |
| Group borders (`archGroupBorderColor`) took the theme's `primaryBorderColor` as each theme's constructor first set it, before the theme recomputed it, so an author's `primaryColor` or `primaryBorderColor` never reached them | The same colour in every theme but `base` (the D332 input `calloutBorder`), and an author's `primaryBorderColor` now recolours them | D541, D332 |

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
| Every outline was a plain element | Group borders, edges and a service's dashed outline go through the outline hook (D302), as `group`, `edge` and `node` | D302 |
