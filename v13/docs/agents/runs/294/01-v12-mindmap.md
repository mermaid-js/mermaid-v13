# 01 — v12 mindmap pointer notes (spec #294)

`$REF` is the reference implementation's checkout (D770).

`V=fa796a943:packages/mermaid/src/diagrams/mindmap`, `SH=fa796a943:packages/mermaid/src/rendering-util/rendering-elements/shapes`, `TT=fa796a943:packages/mermaid-layout-tidy-tree/src`, `CB=fa796a943:packages/mermaid/src/rendering-util/layout-algorithms/cose-bilkent`, `R=fa796a943:packages/mermaid/src`. Read with `git show $V/<file>`.
v12.2.0 dist (the oracle): `node_modules/.pnpm/mermaid@12.2.0/node_modules/mermaid/dist/chunks/mermaid.core/mindmap-definition-6OY57UG3.mjs`.
Results marked (probed) came from running that chunk's `diagram.parser` with `yy = diagram.db` and v12's DOMPurify patched to identity (as `packages/conformance/src/oracle.ts:40–72`), so sanitising is not probed.

## 1. Grammar — `$V/parser/mindmap.jison`

- L8 `case-insensitive`; L13–17 exclusive states `NODE`, `NSTR`, `NSTR2`, `ICON`, `CLASS`. First match wins (no `flex`); quoted words get `\b` (probed: `mindmapx` is a node id, a child spelled `mindmap` is a parse error).
- Lexer rules in order (INITIAL unless noted):
  - L21 `\s*\%\%.*` → `SPACELINE` (trace). `\s*` takes the preceding newline and indent, so a whole comment line is one SPACELINE; also ends a line after a closer (`a(a) %% x`, MMP-22).
  - L23 `"mindmap"` → `MINDMAP`. L24 `":::"` begin `CLASS` (no token). L25 `<CLASS>.+` pop → `CLASS`; L26 `<CLASS>\n` pop.
  - L28 `"::icon("` begin `ICON` (trace). L29 `[\s]+[\n]` → `SPACELINE` (blank/space-only line). L30 `[\n]+` → `NL`.
  - L31 `<ICON>[^\)]+` → `ICON` (may span newlines); L32 `<ICON>\)` pop.
  - L33–40 `NODE_DSTART`, each `begin('NODE')`: `-)`, `(-`, `))`, `)`, `((`, `{{`, `(`, `[`.
  - L41 `[\s]+` → `SPACELIST`. L43 `[^\(\[\n\)\{\}]+` → `NODE_ID` (spaces, `:`, `%`, `"` allowed). L44 `<<EOF>>` → `EOF`.
  - L45 `<NODE>["][`]` begin `NSTR2`; L46 `<NSTR2>[^`"]+` → `NODE_DESCR`; L47 `<NSTR2>[`]["]` pop.
  - L48 `<NODE>["]` begin `NSTR`; L49 `<NSTR>[^"]+` → `NODE_DESCR`; L50 `<NSTR>["]` pop.
  - L51–58 `<NODE>` → `NODE_DEND` + pop: `))`, `)`, `]`, `}}`, `(-`, `-)`, `((`, `(`.
  - L59 `<NODE>[^\)\]\(\}]+` → `NODE_DESCR` (spans newlines); L60 `<NODE>.+(?!\(\()` fallback `NODE_DESCR`.
- Every lexer action that touches `yy` calls only `yy.getLogger().trace(...)` (L21, 28, 29, 32–36, 48–49, 51–60).
- Grammar: L70–74 `start: mindMap | spaceLines mindMap`; L76–80 `spaceLines: SPACELINE | spaceLines SPACELINE | spaceLines NL`; L82–85 `mindMap: MINDMAP document | MINDMAP NL document` (`return yy`).
- L87–93 `stop: NL | EOF | SPACELINE | stop NL | stop EOF`; L94–97 `document: document statement stop | statement stop`.
- L99–108 `statement`: L100 `SPACELIST node` → `yy.addNode($1.length, id, descr, type)` (+`getLogger().info`); L101 `SPACELIST ICON` → `yy.decorateNode({icon})`; L102 `SPACELIST CLASS` → `decorateNode({class})`; L103 `SPACELINE`; L104 `node` → `addNode(0, …)`; L105 `ICON`; L106 `CLASS`; L107 bare `SPACELIST`.
- L112–115 `node: nodeWithId | nodeWithoutId`; L117–120 `nodeWithoutId: DSTART DESCR DEND` → `{id: $2, descr: $2, type: yy.getType($1,$3)}`; L122–126 `nodeWithId: NODE_ID` → `type: yy.nodeType.DEFAULT` | `NODE_ID DSTART DESCR DEND` → `getType($2,$4)`.
- Spec quirks, each checked:
  - Shape from the opener: **confirmed** `$V/mindmapDb.ts:129–144`; `(` → rounded only if closed by `)` (L133). Mismatched closers parse (probed: `b(x]` cloud, `a[b)` rect, `a)b)` cloud). `-)`/`(-` → default (L142, probed).
  - `<NODE>` text spans newlines: **confirmed** L59; the label keeps them (probed: `root(\n  The root\n)` → descr `"\n  The root\n"`). Fixtures: `square-shape`, `circle-shape`, `rounded-rect-shape`.
  - Decoration hits the last node in source order: **confirmed** `mindmapDb.ts:160`. `:::a b` → class string `"a b"`, two CSS classes (probed). A second `:::` **overwrites** (L165; probed `:::c\n:::d` → `d`).
  - Decoration before any node: **confirmed** TypeError (probed: `Cannot set properties of undefined (setting 'icon')`).
  - Second root: **confirmed** `mindmapDb.ts:120–122`; the message uses the sanitised **label** (`node.descr`), not the id.
  - Backward parent scan: **confirmed** `mindmapDb.ts:62–69` (first earlier node with `level < level`).
  - `labelType: 'markdown'` for all: **confirmed** `mindmapDb.ts:274`.
  - `sanitizeText` on id and label: **confirmed** L102, L104; also icon L162, class L165; labels again in `$SH/util.ts:95`.
- (probed) Not in the spec: `a:::b` (no space) is one id `a:::b`, no class; `a %% c` on a shapeless line is the label `a %% c` (NODE_ID eats it; `cleanupComments` only strips whole lines, `$R/diagram-api/comments.ts:7`); `a[b] ::icon(x)` on one line is a parse error; `mindmap root` on one line works (root level 1 → base).
- (probed) Tabs count 1 each (`$1.length`). No title/accTitle/accDescr in the grammar, and `MindmapDB` has no `setDiagramTitle`, so a front-matter title is dropped (`$R/Diagram.ts:52–53`).

## 2. DB — `$V/mindmapDb.ts`

- L26–35 `nodeType`: `DEFAULT 0` = `NO_BORDER 0`, `ROUNDED_RECT 1`, `RECT 2`, `CIRCLE 3`, `CLOUD 4`, `BANG 5`, `HEXAGON 6`. L44–54 binds methods; L55–60 `clear` (nodes, count, elements, baseLevel).
- L75–125 `addNode`: first node sets `baseLevel` and level 0 (L80–83); later `level -= baseLevel` (L85). Level is the **raw indent length**, not depth.
- L90–98 `padding = mindmap.padding ?? 10`, ×2 for `ROUNDED_RECT`, `RECT`, `HEXAGON`. L107 `width = mindmap.maxNodeWidth ?? 200`.
- L112–124 parent via `getParent`; none and not root → throw. Ids `count++` (numbers, L101).
- L154–167 `decorateNode` (no guard for an empty `nodes`). L169–188 `type2Str` (`'hexgon'`) used only by dead `svgDraw.ts`.
- L197–218 `assignSections`: root (`level === 0`) → `undefined`; root children `index % (MAX_SECTIONS−1)` = `% 11` (L214); `colorBy depth` → `(depth−1) % 11` with structural depth (L208).
- L225–304 `flattenNodes`: classes `mindmap-node` + root `section-root section--1` (L232) or `section-<n>` (L235) + `node.class` (L240).
- L246–268 shape map: CIRCLE→`mindmapCircle`, RECT→`rect`, ROUNDED_RECT→`rounded`, CLOUD→`cloud`, BANG→`bang`, HEXAGON→`hexagon`, DEFAULT→`theme.includes('redux') ? 'rounded' : 'defaultMindmapNode'` (L247–248, L263).
- L270–294 node: `id` = counter string, `domId 'node_'+id`, `label` descr, `labelType 'markdown'`, `width`, `height ?? 0`, `padding`, `centerLabel: true` (L284; no shared shape reads it), `look: conf.look`, `icon`.
- L311–348 `generateEdges`: id `edge_<p>_<c>`, `curve 'basis'`, `thickness 'normal'`, classes `edge section-edge-<child.section> edge-depth-<parent.level+1>` (L318–327). **`level` is indent width**, so with 2-space indent the depths go 1, 3, 5 (probed).
- L355–418 `getData`: L359–365 sets `config.layout = 'cose-bilkent'` unless `getUserDefinedConfig().layout` is set; returns `rootNode`, `markers ['point']`, `direction 'TB'`, `nodeSpacing/rankSpacing 50`, `shapes` map, `diagramId 'mindmap-'+uuid` (overwritten by the renderer).
- `getUserDefinedConfig` `$R/config.ts:333–345` = initialize + directives; front matter config reaches it through `addDirective` (`$R/mermaidAPI.ts:85`). v12's global default `layout` is `elk` (`$V/mindmapLayout.spec.ts:7,23–24`).

## 3. Renderer, styles, types, wiring

- `$V/mindmapRenderer.ts`: L15–31 `_updateNodeDimensions` is never called. L41 `getData`; L47–49 `getRegisteredLayoutAlgorithm(config.layout, {fallback: 'cose-bilkent'})`.
- `$R/rendering-util/render.ts:74–97` registers `dagre`, `swimlane`, and in large builds `cose-bilkent` + ELK; L135–151 falls back to the fallback then `dagre` with `log.warn` only. `tidy-tree` exists only when `@mermaid-js/layout-tidy-tree` is registered (`$TT/layouts.ts:5–11`).
- L58–74 per-shape overrides: `rounded` → `radius 15, taper 15, stroke 'none', width 0, padding 15`; `circle` → `padding 10` (**dead**: the shape is `mindmapCircle`); `rect` → `width 0, padding 10`; `hexagon` → `width 0, height 0`.
- `radius`, `taper`, `stroke` are never read by any shape (grep of `rendering-util`); `roundedRect` takes `rx` from `themeVariables.radius ?? 5`.
- L77 `render(data4Layout, svg)` → `insertLookDefs` (`$R/rendering-util/render.ts:118`; `$R/rendering-util/insertLookDefs.ts:46–47` always adds `${svgId}-drop-shadow` / `-small`, L49+ the gradient).
- L83–107 adds a second `<defs><linearGradient id=${svgId}-gradient>` (x 0→100%, `gradientStart`→`gradientStop`) when `useGradient && gradientStart && gradientStop`: duplicate id with `insertLookDefs`.
- L110–115 `setupViewPortForSVG(svg, mindmap.padding ?? 10, 'mindmapDiagram', mindmap.useMaxWidth)`; `$R/rendering-util/setupViewPortForSVG.ts:12–39`: class, viewBox `x−p y−p w+2p h+2p` from `getBBox`.
- `$V/svgDraw.ts`: only `MAX_SECTIONS = 12` (L8) is used (imported by `mindmapDb.ts:10`). `drawNode` (L178–300, `<i class>` icons in `foreignObject` L221–259), the `*Bkg` shapes (L17–168) and `positionNode` (L302–309) have no callers.
- `$V/mindmapTypes.ts:3–22` `MindmapNode` (id number, nodeId, level, descr, type, children, width, padding, section?, height?, class?, icon?, x?, y?, isRoot?, labelType?). `$V/detector.ts:9` `/^\s*mindmap/`; `$V/mindmap-definition.ts:8–15` `db` getter returns a new `MindmapDB` each read.
- Registration: `$R/diagram-api/diagram-orchestration.ts:85–86` large features only, `flowchartElk, mindmap, architecture`.

### `$V/styles.ts`

- Options are `{...themeVariables, theme, look, svgId}` (`$R/mermaidAPI.ts:334–339`, `$R/styles.ts:38`); svgId is `#…`. Diagram CSS sits at `$R/styles.ts:115`, after the global `.edge-thickness-normal` (L79–80), so mindmap's widths win.
- `genSections` L5–74, loop `i < THEME_COLOR_LIMIT`, selector index `i−1` (so `section--1` … `section-10` at 12):
  - L10–17 `lineColor<i>` = `lineColor<i> || cScaleInv<i>`, lightened/darkened 20, never used.
  - L20 `sw = look==='neo' ? max(10−(i−1)·2, 2) : 17−3i` for `.edge-depth-(i−1)` (L45–47). Classic depth 1…4 → 11, 8, 5, 2; 5…10 negative (dropped) → `.edge {stroke-width: 3}` (L104–106). Neo depth d → `max(10−2d, 2)`: 8, 6, 4, 2…; depth ≥ 11 → 3.
  - L22–25 `neoLabel` = `redux`/`redux-dark` exactly → `nodeBorder`, else `cScaleLabel<neutral ? 1 : i>`.
  - L27–31 `.section-N rect, path, circle, polygon` fill `cScale<i>`; L32–37 text fill / span color `cScaleLabel<i>` (no neutral branch).
  - L38–41 `.node-icon-N` 40px `cScaleLabel<i>` (dead). L42–44 `.section-edge-N` stroke `cScale<i>`. L48–51 `.section-N line` stroke `cScaleInv<i>`, width 3. L53–58 `.disabled` fills.
  - L59–63 neo node fill `redux|redux-dark|neutral ? mainBkg : cScale<i>`, stroke `redux|redux-dark ? nodeBorder : cScale<i>`, width `strokeWidth ?? 2`.
  - L64–66 neo edge stroke `theme.includes('redux') || theme==='neo-dark' ? nodeBorder : cScale<i>`. L67–70 neo labels `neoLabel`.
- L76–89 `genGradient`: neo nodes `stroke url(${svgId}-gradient)`, fill `mainBkg`; `.section-N line` width 0. Used when `useGradient && svgId && mainBkg` (L143).
- L97–99 `neoRootLabel` = `includes('redux') ? nodeBorder : cScaleLabel<neutral ? 1 : 0>`; L100–102 `dropShadow` re-scoped to `${svgId}-drop-shadow`.
- L108–116 root fill `git0`, text `gitBranchLabel0`, span `includes('redux') ? nodeBorder : gitBranchLabel0`. L117–132 `.icon-container`, `.edge {fill:none}`, `.mindmap-node-label`.
- L133–142 neo: node `filter` shadow; root fill `includes('redux') ? mainBkg : git0`; root label `neoRootLabel`.
- Theme-name checks, in full: exact `redux`/`redux-dark` (L23, 60–61), `includes('redux')` (L65, 97, 115, 137 and `mindmapDb.ts:248`), `neutral` (L25, 60, 99), `neo-dark` (L65). `redux-color` and `redux-dark-color` pass `includes` but not the exact checks.

## 4. Shared shapes — `$SH/`

- Registry `fa796a943:packages/mermaid/src/rendering-util/rendering-elements/shapes.ts`: `rect` → `squareRect` (L116–125), `rounded` → `roundedRect` (L126–134), `bang` L212–217, `cloud` L220–225, `hexagon` L240–241, `mindmapCircle`/`defaultMindmapNode` internal L574–575.
- `util.ts:50–140` `labelHelper`: wrap width `node.width || node.wrappingWidth || flowchart.wrappingWidth` (L98) — this is where the renderer's `width = 0` (Q5/D287) sends square, rounded and hexagon to `flowchart.wrappingWidth`. `halfPadding = padding/2` (L116). `addSvgBackground = !!node.icon` (L88): the only place a shape reads `icon`. Markdown on (L89, L103).
- `defaultMindmapNode.ts`: `w = bbox.w + 8·halfPadding` (= +4p), `h = bbox.h + 2·halfPadding` (L20–21), `rd 5`; neo flat bottom path (L25–36) vs four rounded corners (L37–48); `<line class="node-line-">` at `y = h/2` (L63–69); rect intersect.
- `roundedRect.ts:10–17`: `rx = ry = themeVariables.radius ?? 5`, label padding `padding` both axes (15 → +30/+30) via `drawRect.ts:21–22` `max(bbox + 2·pad, node.width||0)`.
- `squareRect.ts:8–10`: pad X `neo ? 16 : 2p`, Y `neo ? 12 : p` (p = 10 → +40/+20; neo +32/+24); `node.labelPaddingX` wins if set.
- `mindmapCircle.ts:9–12` → `circle.ts`: `ignoreMinWidth` (L18–20), `r = diag(bbox)/2 + (neo ? 16 : padding)` (L23–29); padding is `mindmap.padding` because the renderer's `circle` branch is dead.
- `cloud.ts:20–21` `w/h = bbox + p`; arcs `r1..r4 = .15/.25/.35/.2 · w` (L24–47); bounds from `getBBox` (L69), rect intersect.
- `bang.ts:20–28` `w = bbox.w + 5p`, `h = bbox.h + 4p`, floor `bbox + 20`; `r = .15w` (L22).
- `hexagon.ts`: `f = neo ? 3.5 : 4` (L29); X/Y names swapped: height adds `labelPaddingX` (`neo ? 70 : p`), width adds `labelPaddingY` (`neo ? 32 : p`) (L35–36, 46–49); `m = h/f`; the `node.width||height` pre-shrink (L37–42) is skipped since both are zeroed. With p = 20: `h = bbox.h + 20`, `w = bbox.w + 2h/4 + 20`.
- Edges: `fa796a943:packages/mermaid/src/rendering-util/rendering-elements/edges.js` `insertEdge` L703; `basis` → `curveBasis` L823–824; class `' edge-thickness-normal edge-pattern-solid ' + edge.classes` L866–892, L947–953.
  - Neo (L969–978): only a `stroke-dasharray` for marker offsets (0 here). There is **no taper** anywhere in v12 edges.
  - Clipping L785–790 needs `startNode.intersect`, but both layout renderers pass `{...node}` copies made before `insertNode` adds `intersect` (`$CB/render.ts:66–70`, `$TT/render.ts:68–76`), so (likely) no clipping: the points come from the layout.

## 5. Layout

- cose-bilkent `$CB/`: `cytoscape-setup.ts:100–138` hidden `#cy` div, edges `curve-style bezier`, `layoutDimensions` from measured w/h, `{name: 'cose-bilkent', quality: 'proof', styleEnabled: false, animate: false}` (randomize left at the plugin default, so not deterministic). Edges ~L185–195 from `rscratch` start/mid/end.
- `$CB/render.ts`: L54–84 insert nodes and `getBBox`; L102 layout; L107–123 `translate(x,y)` (centres); L125–135 three points start/mid/end; L140–194 `insertEdge`.
- tidy-tree `$TT/layout.ts`: L23–72 `executeTidyTreeLayout`; L38–40 `gap 20`, `bottomPadding 40`, `intersectionShift 30` (initial 50, L24); `new BoundingBox(gap, bottomPadding)` and `Layout` from `non-layered-tidy-tree-layout` (L42–43).
- L80–138 `convertToDualTreeFormat`: root = first node with no parent (L106–111); root children `index % 2 === 0` → **left**, odd → right (L124–130); each side under a virtual root `virtual-root-${Math.random()}` (L149–157).
- L166–184 width/height transposed per node (layout runs top-down, read as left-right). L189–292 combine: `treeSpacing = root.width/2 + 30` (L199); x = offset ∓ depth distance (L315, L349).
- L216–256 each side is centred on its **first-level** nodes' y span; the root sits at `(0, 20)` (L258–266); side nodes shift by `∓width/2` (L268–286).
- L455–628 edge points: `start`, an elbow `intersectionShift` beyond the source's side facing the child (L529–552), an elbow before the target's near side (L553–575), `end`.
  - Ends are recomputed against the elbows (L579–607). `['circle','cloud','bang']` use a circle intersection (L493–498); mindmap's `mindmapCircle` misses that list. Rect intersect L389–448.
- `$TT/render.ts` 180 lines: inserts nodes, `getBBox` (L81–83), positions with `translate` (L117), `insertEdge` with the layout points (L140–152).
- `mindmap.layoutAlgorithm` (schema default `cose-bilkent`, `$R/schemas/config.schema.yaml:1235–1238`) is never read. Schema also: `colorBy` branch|depth L1219–1228, `padding 10` L1229–1231, `maxNodeWidth 200` L1232–1234.

## 6. v12 specs and theme pointers

- `$V/mindmap.spec.ts` (365 lines): **26** `parse` calls, 26 `it`s (24 `MMP-*` incl. `MMP-12-a`, plus `3` and `5`). Root errors L61–78 (MMP-6 expects `fakeRoot`).
- `$V/mindmapColors.spec.ts` (125 lines): 9 textual `parse(` (helper def L15 + `parser.parse` L18 + 7 call sites); 8 runtime parses (`it.each` ×2 at L44–53); 4 distinct texts. Fixture L33–42 mixes indent widths; the depth test is L55–65.
- Also `$V/mindmapDb.getData.test.ts` (12 tests, no parse; the edge-depth test L262–311 uses levels 0/1/2, which hides the indent-width dependence) and `$V/mindmapLayout.spec.ts` (3 tests on layout choice).
- v13 descriptor: `packages/conformance/src/jison/types.ts:125–134` (probe `mindmap\n  root`, specs both files).
- Themes `fa796a943:packages/mermaid/src/themes/` (line of first `cScale0` / `cScaleInv` / `cScaleLabel` / `git0` / `gitBranchLabel0` / `THEME_COLOR_LIMIT`):
  - base 156/180/195/371/408/22; default 150/171/186/402/437/40; dark 206/221/239/383/399/31; forest 126/148/158/374/409/33; neutral 152/167/181/390/409/44.
  - neo 176/200/215/325/362/23; neo-dark 189/213/228/338/376/37.
  - redux 187 (loop)/201/216/327/364/23; redux-dark 203/227/242/353/390/37; redux-color 226/271/286/398/435/23; redux-dark-color 230/274/289/415/452/37. Registry `index.js:14–40`.

## 7. Corpus — `e2e/diagrams/mindmap/` (v13 tree)

- 33 `.mmd`: `nightly-check` 24, `pr-check` 9, `visual-check` 0.
- `layout: tidy-tree`: 5, `pr-check/1…5-tidy-tree-*.mmd`. `colorBy: depth`: 1, `pr-check/depth-colors.mmd` (also `theme: base`, `look: neo`, `themeVariables` git0/gitBranchLabel0/cScale*).
- Themes: six `nightly-check/all-shapes-neo-look-{neo,neo-dark,redux,redux-dark,redux-color,redux-dark-color}-theme.mmd`, all `look: neo` (7 with depth-colors). `htmlLabels: false`: `pr-check/6-…-issue-8387.mmd`.
- `::icon`: 5 files — `a-root-with-an-icon` (1), `all-shapes-with-mdi-fire-icon` (8, `mdi:fire`), `branches-with-shapes-and-labels` (2), `bang-and-cloud-shape` (3), `pr-check/3-tidy-tree…` (1, `fa fa-book`). `:::` classes: **none** in the corpus.
- Repeated ids: `bang-and-cloud-shape*.mmd` (`a` ×2), `pr-check/3` (`id` ×2). Id-less root: `pr-check/4` `((This is a mindmap))`. `<br/>`: `branches-with-shapes-and-labels.mmd:19`.
- Description errors, all confirmed: `rounded-rect-shape.mmd:3` says rounded but L7 is `((`; `circle-shape.mmd:3` says circle but L7 is `(`. `bang-and-cloud-shape.mmd:4` says "each carrying its own icon" and has 3; `…-with-icons.mmd:3–5` says "without any icon" and has none: the names are swapped, not the bodies.
- Extra error: `text-should-wrap-with-icon.mmd:3` says "carrying both an icon" but has no `::icon` line.

## 8. The reference implementation — `$REF/src/diagrams/mindmap/`

- `db.ts:33–60` stack of open nodes: pop while `open[top].level >= level` (L45), parent = top, root error text as v12 (L48), section at insert `parent.isRoot ? children.length % 11 : parent.section` (L54). `decorateNode` ignores a missing node (L62–68).
- `parser.ts` → `../common/outline.ts` (`tokenize` L115, `parseOutline` L262, `getType` L64; shared with kanban).
- `render.ts:120–148` subtree bands: `stack` (L120–134) piles children with `GAP_Y 8` / `GROUP_GAP 18`, extents bottom-up over the depth-first order (L137–148). It is a stacked band layout, not contour-compacting Reingold–Tilford.
- `render.ts:166–203` left/right split (D283): first `split` branches right, rest left, `split` minimises `|2·right − total + (2k − count)·BRANCH_GAP_Y|` (L172–182). x steps `w/2 + GAP_X 36 | BRANCH_GAP_X 52 + w/2` (L200).
- `render.ts:157–165` outline (`down`) mode via `turnToFit` (`../common/fit-width.ts:44`). No tidy-tree code in the reference implementation (grep).

## 9. Surprises (against the spec)

1. **`edge-depth-<d>` is indent width + 1, not tree depth** (`mindmapDb.ts:326`, `level` = raw `$1.length` L100). 2-space indent gives 1, 3, 5 (probed), so classic widths are 11, 5, 3, not 11, 8, 5. The spec's width table holds only for 1-space indents (the v12 unit test uses those).
2. **No neo edge taper exists.** `node.taper = 15` (`mindmapRenderer.ts:61`) is set on rounded nodes and never read; neo edges get only the marker dasharray (`edges.js:969–978`). Same for `radius 15` and `stroke 'none'`.
3. **The `circle` padding override is dead** (`mindmapRenderer.ts:65`, the shape is `mindmapCircle`), so `mindmap.padding` reaches circles too (`circle.ts:24,29`). That contradicts Q5's "default, cloud, bang and hexagon".
4. The neutral label rule (`cScaleLabel1`) applies only under `[data-look="neo"]` (`styles.ts:22–25, 67–70, 97–99, 139–142`); classic `.section-N text` uses `cScaleLabel<i>` in neutral too (L32–34).
5. A repeated `:::` overwrites the class (`mindmapDb.ts:165`). `a:::b` is an id, and `a %% c` keeps the comment in the label. `::icon` on a node's line is a parse error.
6. `mindmapColors.spec.ts` "9" counts the helper's own `parse(`s; 7 call sites, 8 runtime parses. tidy-tree's round-shape list misses `mindmapCircle` (`$TT/layout.ts:493`), and its root sits 20 px low (L261).
7. Shapes do read `node.icon`, for a label background (`util.ts:88`), against Q4's "never read". Neo gradients get a duplicate `${svgId}-gradient` id (`insertLookDefs.ts` + `mindmapRenderer.ts:86–90`). A fourth fixture description is wrong (`text-should-wrap-with-icon.mmd`).
