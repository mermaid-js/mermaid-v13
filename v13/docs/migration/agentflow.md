## Agentflow

- **Detection** is v12's: `agentflow-beta` (`/^\s*agentflow-beta\b/`, case-sensitive), fourth
  in detection order, after `architecture` and before `c4`. `agentflow` alone and
  `agentflow-betas` are not agentflow diagrams.
- **Syntax** is v12's (the grammar is in [syntax/agentflow.md](./syntax/agentflow.md)), and
  every error is reported, not only the first (R-PARSE-4). Two inputs read differently: the
  short input form `a[/x/]` is a parallelogram of kind `input` (D462), as v12 drew it after
  12.2.0 (12.2.0 drew a rounded box and warned `SHAPE_UNSUPPORTED`); and a lone `%` in a label
  (`a[50% done]`) is label text (D463), where 12.2.0 rejected the diagram; `%%` is still a
  comment.
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
  `flowchart.subGraphTitleMargin` (room around a flow's title); its edges follow
  `flowchart.curve`.
- **Limits**: the edge limit is v13's (`maxEdges`, 5,000 by default and set only by the
  integrator, R-SEC-5), with the message `Edge limit exceeded…`; v12 threw at 501 edges. A source
  longer than `maxTextSize` is rejected before it is parsed, as for every diagram.
- **Links and tooltips**: `click a "url" "tooltip"` draws an `<a href>` (only URLs that pass
  `securityLevel` and `linkSchemes`) and an SVG `<title>`, as flowchart does; `click a callback`
  needs `@mermaid-js/plugin-interactions` ([Click callbacks](#click-callbacks-and-bindfunctions)).
- **Hand-drawn**: with `@mermaid-js/plugin-hand-drawn`, vertices, flow frames, collapsed cards
  and edges are sketched, as in v12 ([Hand-drawn look](#hand-drawn-look)).
- **Text output**: `format: 'ascii'` throws `UnsupportedFormatError` until agentflow's ASCII
  renderer lands (R-ASCII-5, #551).

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
| Edge: `<path class="… flowchart-link" id>` inside `g.edges.edgePath` | `<path class="flowchart-link edge-thickness-normal edge-pattern-solid\|dotted[ edge-animation-*][ classes]" data-id data-ast>` directly in `g.edgePaths`; a dotted edge is `stroke-dasharray="2"` with butt caps. Its ends are on the outline of the shape drawn (the layout puts them there), and its curve follows `linkStyle … interpolate`, the default's, or `flowchart.curve` | One element per edge maps it to its source |
| Labels: `<foreignObject>` with HTML (`span.nodeLabel`, `div.labelBkg`) | `<text>`/`<tspan>` from core's label layout (markdown strings as markdown, math with the math plugin, D176) | No HTML mode (D5); labels measure deterministically (R-TEXT-4) |
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
