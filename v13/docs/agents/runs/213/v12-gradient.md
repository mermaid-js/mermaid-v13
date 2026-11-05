# v12 (fa796a943) neo gradient and drop shadow: pointer notes

From an exploration pass; verify each line against `git show fa796a943:<path>` before relying on it.

## Shared plumbing
- `rendering-util/insertLookDefs.ts:24-73`: `<svgId>-drop-shadow` filters (unused by the neo themes' CSS, see below) and, only `if (useGradient)`, `<linearGradient id="<svgId>-gradient">` horizontal, objectBoundingBox, gradientStart → gradientStop (:49-73).
- Callers: `rendering-util/render.ts:118` (flowchart, class, state, ER) and `block/blockRenderer.ts:42`. **Sequence never calls it**: no gradient def in sequence.
- `styles.ts:32-38`: the global neo block comes after `${diagramStyles}`, so it wins specificity ties.
- `nodes.ts:55`: `data-look` on `newEl`; a linked node's `newEl` is the `<a>` wrapper without `.node`, so linked nodes lose the neo rules (a v12 bug; v13 need not copy it).
- Edges, edge labels and markers never get the gradient.
- Drop shadow in neo is the theme's CSS `dropShadow` (`drop-shadow(...)`), not the `<filter>` defs.

## `styles.ts` `[data-look="neo"]` rules
- :120 `.node rect, .cluster rect, .node polygon`: gradient stroke + shadow. :124 swimlane cluster: no filter.
- :129 `.node path`: gradient stroke, `stroke-width: strokeWidth`; no filter. :134 `.node .outer-path`: shadow only.
- :138 `.node .neo-line path`: plain `nodeBorder`, no filter (non-gradient divider).
- :143 `.node circle`: gradient stroke + shadow. :148 `.node circle .state-start` never matches (stray space).
- :152 `.icon-shape .icon`: gradient **fill** + shadow; :157 `.icon-shape .icon-neo path`: gradient stroke + shadow.
- No gradient fill on node bodies.

## Flowchart
- `flowchart/styles.ts` has no gradient; its `.node … { stroke: nodeBorder }` loses to the neo rules.
- Gradient stroke + shadow: plain rect/polygon/circle nodes, rough-path shapes (stroke; shadow where `outer-path`), subgraph `.cluster rect` (not swimlanes), icons.
- Not: edges, edge labels, markers, text.
- Radius: `squareRect.ts:13` rx 0 (sharp); `roundedRect.ts:10` `themeVariables.radius ?? 5` (neo 3); cluster rect sharp (`clusters.js:101`).

## Sequence
- **No gradient.** Shadow: `svgDraw.insertDropShadow` (`svgDraw.js:1765-1779`) with `flood-color` black only for redux/redux-color, so neo gets a white filter shadow (v12 bug); actor rect `filter=url(#…-drop-shadow)` (:462). Notes: `styles.js:17 rect.note[data-look=neo]` → noteBorderColor + CSS dropShadow. `.labelBox` CSS shadow under neo.
- Actor rx hard-coded 3, 6 under neo (`svgDraw.js:448-453`).

## Class
- `shapes/classBox.ts:78-93`: outer box rough rectangle path `outer-path` → gradient stroke + shadow, no corner radius.
- Dividers (:203-237) `rc.line` with +0.001 y offset (non-zero bbox height for the gradient); class `divider` plus ` neo-line` only when `look==='neo' && !useGradient`. So with neo themes, **dividers get the gradient**.
- Namespaces `.cluster rect`: gradient + shadow, sharp. Notes (`note.ts:44`, `outer-path`): gradient + shadow.
- Relations, markers, labels: none.

## State
- `state/styles.js:318-322` `[data-look=neo].statediagram-cluster rect`: `fill: mainBkg` + gradient stroke; `rect.outer` (:323-327) `rx/ry: radius` + shadow. Inner rect keeps `compositeBackground` but gradient stroke.
- Composites are not `.cluster`, so only the state rule applies.
- Start dot (`stateStart.ts`, `g.node circle.state-start`): gradient stroke, fill `specialStateColor`, CSS shadow. End dot (`stateEnd.ts`, rough circles in `g.outer-path`): both paths gradient stroke, group shadow.
- Choice, fork/join (rough paths): gradient stroke. Notes: gradient + shadow.
- Simple state rx: `shapes/state.ts:7-8` 3 for neo (but `.statediagram-state rect.basic { rx: 5px }` at styles.js:267 may override in CSS — check in a browser).
- Transitions, labels: none.

## ER
- `er/styles.ts`: no gradient rule.
- `shapes/erBox.ts`: entity `rc.rectangle` path `outer-path` (:246-250) → gradient + shadow; row rects (:257-266) → gradient stroke; dividers (:268-316) → gradient stroke; attribute-less entity via `drawRect` rx 0 (:52-67) → gradient + shadow. Corners sharp.
- Relationships, cardinality markers, labels: none.

## Themes
- `theme-neo.js`: radius 3, strokeWidth 2, nodeBorder/stateBorder `#000000`, useGradient true `#0042eb` → `#eb0042`, dropShadow `drop-shadow( 0px 1px 2px rgba(0, 0, 0, 0.25));`, no darkMode.
- `theme-neo-dark.js`: background `#333`, mainBkg `#2a2020`, border1 `#ccc`, radius 3, strokeWidth 1, nodeBorder = border1, same gradient, dropShadow `drop-shadow( 1px 2px 2px rgba(185,185,185,0.2))`, labelBackground `#181818`, no darkMode.
- Neither has `nodeShadow`.

## v13 outline sites (at the integration base)
- flowchart `packages/diagram-flowchart/src/render/render.ts`: paint :144 nodeBorder, :149 shadow, :155/:161 clusterBorder; node `shapeAttrs` :398-409; clusters :276-278.
- sequence `packages/diagram-sequence/src/render/`: `paint.ts:108` actorBorder, :124 note, :149 rect; `symbols.ts` actor shapes.
- class `packages/diagram-class/src/render/render.ts`: :113 nodeBorder, box `rect.outer-path` :447-455, dividers :456-466, namespace :283-285, note :513-515.
- state `packages/diagram-state/src/render/render.ts`: :129 border, composite `rect.outer` :285-300, node shapes :440-452; `shapes.ts`.
- er `packages/diagram-er/src/render/render.ts`: :101 nodeBorder, cluster :276-284, entity :361-376, rows :410-416, dividers :460-466.
