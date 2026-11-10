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
