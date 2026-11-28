# 01 — v12 block (at `fa796a943`) and the v13 pieces it maps to

Read v12 with `git show fa796a943:packages/mermaid/src/diagrams/block/<file>`. Line numbers are file lines.

## v12 files (`packages/mermaid/src/diagrams/block/`)

| File | LOC | Role |
|---|---|---|
| `parser/block.jison` | 293 | lexer and grammar |
| `blockDB.ts` | 390 | module-state DB: model build, classes, edge-string decoding |
| `layout.ts` | 369 | two-pass grid sizing and placement, bounds |
| `renderHelpers.ts` | 302 | block → rendering-util node, insertNode, edges |
| `blockRenderer.ts` | 86 | `draw`: defs, markers, size, layout, insert, viewBox |
| `styles.ts` | 209 | CSS text plus composite palette |
| `blockTypes.ts` | 76 | `BlockType` (3-30), `Block` (32-68), `ClassDef` (70-74), `Direction` (76) |
| `blockDetector.ts` | 20 | `/^\s*block(-beta)?/` (6) |
| `parser/block.spec.ts` | 456 | 26 `it`s |
| `blockDB.spec.ts` | 48 | 4 |
| `blockColorIndex.spec.ts` | 160 | 8 |
| `layout.spec.ts` | 49 | 2 (`calculateBlockPosition`) |
| `rendering-util/rendering-elements/shapes/blockArrow.spec.ts` | 197 | 18 (16 point sets 35-179, dedupe 188, natural width 194) |

## block.jison

- Lexer states 12-27. `block-beta` 39, `block:` 40 (`id-block`), `block` 41 (`BLOCK_DIAGRAM_KEY`). `[\s]+` 44 eats `\n`, so `NL` (47) never fires.
- `columns auto` 48 (yytext −1), `columns \d+` 49; md_string 50-52; `"` → `string` 53-55; `space:\d+` 56, `space` 57; unused `default`/`linkStyle`/`interpolate` 58-60.
- classDef 62-65 (`\w+\s+`, then `[^\n]*`); class 67-69 and style 71-73 ids `(\w+)+((","\s*\w+)*)`; acc rules 75-81 (no grammar rule); `"end"\b\s*` 82.
- `NODE` closers 85-101; openers 104-122 (121 duplicates 119); `<[` 124 → `BLOCK_ARROW`; strings 130-137; `]>\s*(` 139 → `ARROW_DIR`; DIR 140-145 strip only a leading comma (trailing blanks stay); `)` 146 pops both.
- `NODE_ID` `[^\(\[\n\-\)\{\}\s\<\>:=]+` 126; `EOF` 127. Links: `LINK` 149-152, `START_LINK` 153-155 → `LLABEL`; `LLABEL` `"` 157 (returns `LINK_LABEL`, pushes `string`), closers 158-160. `':'\d+` 161 → `SIZE`.
- Grammar: `start` 185 (`yy.setHierarchy`); `document` 199-202 right-recursive `[$1].concat($2)` (quadratic); `link` 204-209; `statement` 211-220 (space 215); `nodeStatement` 222-237 (chain 223-233, `node SIZE` 235, `node` 236); `columnsStatement` 240-242; `blockStatement` 244-247; `node` 249-257; `dirList` 259-261; `nodeShapeNLabel` 263-268; classDef 271-278; class 280-285; style 287-291.

## blockDB.ts

- `addStyleClass` 31-52 (split on `,`; an attribute with `color` also pushes a text style, `fill`→`bgFill`, `color`→`fill`, 44-48). `addStyle2Node` 61-66 (unknown id throws, D443). `setCssClass` 76-89. `nextColorIndex` 103 (pre-order composite counter, assigned 160-162).
- `populateBlockDatabase` 105-192: flatten (106); span > columns warning (111-121); sanitize labels (122-124); classDef/applyClass/applyStyles (125-138); column setting (139-140); edge ids `count-start-end` (141-145); default label id, `''` for composites (147-154); merge existing (155-172); recurse (174-176); space → `w` clones `id-j` (177-185); push only new blocks (186-188).
- `clear` 197-209 seeds `root` (200-201). `typeStr2Type` 211-248 (`>]` → `rect_left_inv_arrow` 221, `<[]>` → `block_arrow` 243, else `na`). Edge decoding 250-297. `generateId` 299-303 (`Math.random`).
- **D442 bugs:** chain (223-233: `$1` is the previous 3-array, so `$1.id` undefined); class-before-declaration (79-82 inserts `na`, later declaration counts as existing, never pushed 186-188); `class a, b` untrimmed lookup (78) replaces the real `b` (80-82); `root` (201, 186, merges into the real root 166-171); leaf then `block:id` (167; children go onto an unstored object 175).

## layout.ts

- `calculateBlockPosition` 11-36 (throws on 0 / non-integer; auto → one row; 1 → one column).
- `getMaxChildSize` 38-70 (skips spaces 58; width per column 61).
- `setBlockSizes` 72-207: seed from sibling size 88-95; **recurses twice** 100-102 and 126-128 (O(2^depth)); child width 115-116; `numItems`/`xSize`/`ySize` 130-142; container 144-145; stretch when narrower than the sibling cell 147-169; grow to fit 176-190.
- `layoutBlocks` 209-322: row heights 225-243, row offsets 244-252, `startingPosX` 257 / reset 267-270, `x` 277, `y` 296-297, recurse 307-309, overflow clamp 310-315.
- `findBounds` 324-349 (skips `root`); `layout` 351-369 (`block.padding ?? 8`).
- Layout is pure given leaf sizes: a test-only verbatim copy (as `conformance/src/venn/v12-layout.ts`) can check the linear port's parity on small fixtures.

## renderHelpers.ts / blockRenderer.ts / styles.ts

- `getNodeFromBlock` 16-136: classes `classes|default + ' flowchart-label'`; type → shape switch 33-97; padding 0 for composites, else `block.padding` (130); `wrappingWidth` Infinity (125).
- `insertBlockPositioned` 158-187 (spaces skipped, `stampColorSlot` 173-183). `insertEdges` 215-302 (points: start centre, midpoint, end centre 253-257; classes `edge-thickness-*`, `edge-pattern-*`, `flowchart-link LS-a1 LE-b1` 260-264; label at the midpoint 292-297).
- `draw` 16-81: look defs 42, markers point/circle/cross 45-48, `g.block` 54, viewBox margin 5 (71-79).
- styles: `genColor` 41-64 (`[data-look][data-color-id="color-i"].node rect.composite`, gated by `isColorTheme`); `.node rect, circle, ellipse, polygon, path` 98-110 (`mainBkg`, `nodeBorder`, `strokeWidth ?? 1`); `.flowchart-link` 137-140; `.edgeLabel` 142-161; `.node .cluster` 168-174 never matches composites.

## Shapes (v12 `rendering-util/rendering-elements/shapes/`)

| Block type | v12 shape (file) | padding / neo | v13 flowchart `S` entry (`diagram-flowchart/src/render/shapes.ts`) |
|---|---|---|---|
| square / na | `rect` (`squareRect.ts`) | X neo 16 else 2·pad, Y neo 12 else pad | `rect` 257 |
| round | `rect` rx=ry 5 | same | `rounded` 258 |
| diamond | `question.ts` | `bbox + padding`, no neo | `diam` 326 |
| hexagon | `hexagon.ts` | f neo 3.5 else 4 | `hex` 335 |
| odd `>]` | `rectLeftInvArrow.ts` | neo 21/12 per side | `odd` 350 |
| lean_right / lean_left | `leanRight.ts` / `leanLeft.ts` | Y pad, X neo 2·pad | `lean-r` 451 / `lean-l` 452 |
| trapezoid / inv_trapezoid | `trapezoid.ts` / `invertedTrapezoid.ts` | same pattern | `trap-b` 453 / `trap-t` 455 |
| circle | `circle.ts` | neo 16 | `circle` 298 |
| stadium | `stadium.ts` | neo 40/24 | `stadium` 264 |
| subroutine | `subroutine.ts` | neo 28/12 | `fr-rect` 276 |
| cylinder | `cylinder.ts` | neo 24/24 | `cyl` 286 |
| doublecircle | `doubleCircle.ts` | gap neo 12 else 5 | `dbl-circ` 307 |
| block_arrow | `blockArrow.ts` (225) | none; `DIRECTION_ORDER` 25, dedupe 28-48, 15 factories 53-181, `getArrowPoints` 183-198, stretch only when spanning 211-212 | new |
| composite | `composite.ts` (44) | none; `rect.basic.cluster.composite.label-container` 27-35 | new |

Flowchart's shape helpers: `Pads` 19-44, `box` 104, `padded` 119, `lean` 127, `cylinder` 185, `rhombus` 220, `slanted` 229; exports `shapeSize` 838, `drawShape` 841, `shapeInset` 850; `padsOf` in `render/prepare.ts:171-194`. Local copies elsewhere: `diagram-state/src/render/shapes.ts`, `diagram-mindmap/src/render/shapes.ts`, `diagram-class/src/render/route.ts`.

## v13 side

- Corpus `e2e/diagrams/block/`: 58 `.mmd` (`nightly-check` 28, `pr-check` 10, `visual-check` 20). No `packages/conformance/corpus/block*` yet.
- `JISON_TYPES` `packages/conformance/src/jison/types.ts:116-268`; `JisonTypeDescriptor` 67-85; `HarvestMethod` 19-52; kanban 191-199 (`run`), venn 258-267 (`literals`, `yy`).
- `custom` package layout to copy: `diagram-quadrant` and `diagram-venn` (venn measures labels inside `layout` through `ctx.measurer`, `layout.ts:95-96`, which block needs).
- The reference implementation is not on this machine (`/Users/knsv/repos/pele` missing).
