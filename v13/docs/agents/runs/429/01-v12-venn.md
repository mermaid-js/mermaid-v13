# 01 — v12 venn, venn.js 2.0.0, oracle, corpus (pointer notes)

v12 source is `git show fa796a943:packages/mermaid/src/diagrams/venn/<file>`. venn.js line numbers are `build/venn.esm.js` (2,214 lines). This worktree has **no `node_modules`**. The read-only installs used here are in the sibling worktree `.claude/worktrees/t486` (branch `feature/486_venn-lexer`, same base 12ba676cb).

## 1. Files (`fa796a943:…/diagrams/venn/`, 676 LOC excluding specs)

| File | Lines | What |
| --- | --- | --- |
| `parser/venn.jison` | 135 | lexer L1–46, grammar L48–135 |
| `vennDB.ts` | 133 | module-level state + `db` object L114–133 |
| `vennRenderer.ts` | 437 | `draw` L31–241, `renderTextNodes` L247–374, `ensurePairwiseSubsets` L393–435 |
| `styles.ts` | 33 | `<style>` text |
| `vennTypes.ts` | 36 | `VennData` L4, `VennTextData` L10, `VennStyleData` L16, `VennDB` L21–36 |
| `vennDetector.ts` | 24 | `/^\s*venn-beta/` L10 (no `i` flag) |
| `vennDiagram.ts` | 13 | `{parser, db, renderer, styles}` |
| specs | 255 / 251 / 117 | `parser/venn.spec.ts`, `vennRenderer.spec.ts`, `vennPalette.spec.ts` |

Elsewhere at fa796a943: `packages/mermaid/src/docs/syntax/venn.md` (150 lines), `docs/syntax/venn.md`, `demos/venn.html`, `packages/examples/src/examples/venn.ts`, empty `e2e/rendering/venn/{pr,nightly,visual}-check/.gitkeep`. Config: `schemas/config.schema.yaml:3070–3100` `VennDiagramConfig`. Note that it has **`theme` default `'redux-color'` and `look` default `'neo'`** (per-diagram defaults; docs page L13–19), then `width` 800, `height` 450, `padding` 8, `useDebugLayout` false.

## 2. Lexer (`venn.jison`)

- L2 `case-insensitive`, L4 `%s bol` (inclusive).
- L7–8: two comment rules. L8 `[^\}]\%\%[^\n]*` eats the char before `%%` (the glued-comment quirk).
- L10 `<bol>` blank before a line end: skipped.
- L11–17 `<bol>[ \t]+(?=text\b)`: if `yy.getIndentMode()` (L12), sets `yy.consumeIndentText = true` (L13), `begin('INITIAL')`, returns `INDENT_TEXT`. When the mode is off, it falls through and returns nothing.
- L18 `<bol>` blank: skipped. L19 `<bol>[^ \t\n\r]`: **`yy.setIndentMode(false)`**, `begin('INITIAL')`, `unput(yytext)`. The lexer writes the mode as well as reading it.
- L21 `[\n\r]+` → NEWLINE + `begin('bol')`. L22 `%%…` skip. L23 blanks. L24 EOF.
- L26 `"title"\s[^#\n;]+` TITLE. L27–31 `venn-beta` VENN, `set`, `union`, `text`, `style`. **L30 `text` returns no token when `yy.consumeIndentText`** (it clears the flag), so an indented line gives `INDENT_TEXT` and no `TEXT`.
- L33 `["…"]`, L34 `[…]` (trimmed) BRACKET_LABEL. L36 NUMERIC, L37 **`HEXCOLOR`**, L38 **`RGBACOLOR`**, L39 **`RGBCOLOR`**, L40 IDENTIFIER, L41 STRING (quotes kept), L43 **`COMMA`**, L44 **`COLON`**. The spec's HEX/RGB/RGBA are short names for these.

## 3. Grammar (`venn.jison`)

- `start` L52–54 `optNewlines VENN document EOF`. `document` L61–64, `line` L66–69.
- `statement` L71–88: TITLE L72 (`substr(6)`); SET ×4 L73–76; UNION ×4 L77–80, each throwing `union requires multiple identifiers`, then `validateUnionIdentifiers`; TEXT ×5 L81–85; INDENT_TEXT L86; STYLE L87.
- **Only the SET/UNION actions call `yy.setIndentMode(true)`.**
- `indentedTextTail` L90–96: `getCurrentSets()`, plus the unreachable `text requires set`.
- `stylesOpt`/`styleField`/`styleValue`/`valueTokens`/`valueToken` L98–123 (`join(' ')` L109). `identifierList` L125–128, `identifier` L130–133.

## 4. DB (`vennDB.ts`)

- State L16–21: `subsets`, `textNodes`, `styleEntries`, `knownSets`, `currentSets`, `indentMode`.
- `addSubsetData` L23–36: sorts, default size `10 / n²` L25, sets `currentSets` L26, adds a single set to `knownSets` L27–29.
- `normalizeText` L42–48: trims, then strips one pair of quotes. `addTextData` L54–61. `addStyleData` L63–70. `validateUnionIdentifiers` L80–86 throws `unknown set identifier: <ids>`.
- `getCurrentSets` L92, **`getIndentMode` L93, `setIndentMode` L94–96**. `customClear` L104–112. `db` L114–133 is a **plain object**, so the jison oracle's `defaultYy` returns the DB itself (`conformance/src/jison/oracle.ts:84–87`).
- Callers of the feedback: `getIndentMode`: jison L12 only. `setIndentMode`: jison L19 (false) and L73–80 (true). `consumeIndentText` is a plain `yy` property, not a function, written at L13 and read and cleared at L30. jison's `parse` copies `parser.yy` into `sharedState.yy`, so the flag lives on that copy.

## 5. Renderer (`vennRenderer.ts`)

- Constants: `REFERENCE_WIDTH = 1600` L66 and `scale = width / 1600` L67; `titleHeight = 48s` L68; title `font-size 32s` L81, `y = 32s` L85, fill `vennTitleTextColor || titleColor` L86; circle `fill-opacity` 0.1 L131, stroke-width `5s` L133, `stroke-opacity` 0.95 L160; set and overlap labels `48s` L167, L204, L210; text-area `font-size 40s` L293.
- **Double solve.** `venn.VennDiagram().width().height()` L91–95 uses venn.js's default padding 15 and draws the visible circles, paths and labels. `venn.layout(renderSets, {padding: config.padding ?? 15})` L102–106 uses the config default 8 and feeds the text nodes and the hand-drawn circles. Checked in Node: two equal sets give r 210.00 versus 217.00.
- `ensurePairwiseSubsets` L393–435: each missing pair gets `min(a, b) / 4` L426–427, with a dead fallback of 2.5.
- Palette: `themeColors` L41–50 is `venn1..8` filtered to the non-empty ones; `paletteColor = themeColors[i % len]` L128; `baseColor = style.fill || palette || primaryColor` L129; class `venn-set-${i % 8}` L130.
- **`isDark`**: `themeDark = isDark(background || '#f4f4f4')` L120, reading the background's luminance and not a trait. Set label `style.color || (dark ? lighten(base, 30) : darken(base, 30))` L163–164, using khroma's HSL functions.
- Overlap label `color ?? vennSetTextColor ?? (primaryTextColor ?? textColor)` L70, L205, L215. Overlap path `fill-opacity` 1 if styled, else 0, fill styled or `transparent` L218–229.
- Hand-drawn: `isHandDrawn = look === 'handDrawn'` L40, `rough.svg` L97–99; circle L139–149: `roughness 0.7`, `seed handDrawnSeed`, `fill transparentize(base, 0.7)` (alpha 0.3), `fillStyle 'hachure'`, `fillWeight 2`, `hachureGap 8`, `hachureAngle -41 + i*60`, `stroke`, `strokeWidth`. It uses the **padding-8** solve circle (L136–138). styled overlap L184–193: `roughness 0.7`, `fill transparentize(fill, 0.3)` (alpha 0.7), `fillStyle 'cross-hatch'`, `fillWeight 2`, `hachureGap 6`, `hachureAngle 60`, `stroke 'none'`.
- Text grid `renderTextNodes` L247–374: groups nodes by sorted set key L260–269 and skips areas with no `text` L274; `innerRadius` = min over circles of `r − dist(centre)` L281–284, else `0.6 · minR` L285–287; `innerWidth = max(80s, 1.9·innerR)`, `innerHeight = max(60s, 1.9·innerR)` L308–309; `labelOffset = min(32s, innerR/4)` if labelled, plus `30s` when there are two or fewer nodes, L311–312; `cols = ceil(√n)` L315, cells L317–325, box at 90 % L341–342; `foreignObject` + `xhtml:span` L345–367, colour from `styleByKey.get(node.id)` L354; debug circle L294–305 (purple, dash `6s 4s`) and debug cell L327–339 (teal).
- Group order: venn.js's `.venn-area` groups first, then `g.venn-text-nodes` appended to the dummy svg L257, then everything moved under `g[transform=translate(0,titleH)]` L233–239. `configureSvgSize` L240.

## 6. `styles.ts`

`.venn-title` 32px L10–14 (beats the 16px attribute), `.venn-circle text` 48px L16–19, `.venn-intersection text` 48px + `vennSetTextColor` L21–25, `.venn-text-node` colour L27–30. There is no theme-name, `neo` or gradient branch.

## 7. Specs (counts)

- `parser/venn.spec.ts`: **17 `test`s** (L13–242). The harvestable literals are template strings `` `venn-beta\n …` `` passed to `venn.parse(str)` directly, with **no mermaid preprocessing**. Throwing cases: L220 `set A,B`, L227 `union A` (message), L234 unknown id (message).
- `vennRenderer.spec.ts`: **12** (6 `draw` L28–149, plus 6 in `describe('ensurePairwiseSubsets')` L167–241). It needs a DOM (`document.body.innerHTML`).
- `vennPalette.spec.ts`: 6 `it` sites, **18 cases** once expanded: L33 covers every theme; L37 is `.each` over 7 themes; L47 is `.each` over 4 (`NO_VENN_PALETTE = neo, neo-dark, redux, redux-dark` L29); L54 is `.each` over 2 × 2 `it`s; L102 and L109 are renderer cases.
- Theme formulas: `theme-default.js:286–296`, `theme-base.js:246–256`, `theme-forest.js:249–259` (`venn3` −30), `theme-dark.js:258–263` (`lighten(cScale<i>, 30)`), `theme-neutral.js:279–284` (`cScale<i>`), `theme-redux-color.js:332–340` and `theme-redux-dark-color.js:349–357` (`borderColorArray[i % len]`). The four no-palette themes define only the two text variables (`theme-neo.js:266–268` etc.).

## 8. Syntax page

`packages/mermaid/src/docs/syntax/venn.md` (150 lines) has **8 `mermaid-example` blocks**, at L23, L40, L69, L81, L94, L106, L119 and L140. The L40 example sets `theme: default` and `look: classic` in front matter.

## 9. venn.js 2.0.0

- Path: `t486/node_modules/.pnpm/@upsetjs+venn.js@2.0.0/node_modules/@upsetjs/venn.js/build/venn.esm.js`. It is reached as `node_modules/.pnpm/mermaid@12.2.0/node_modules/@upsetjs/venn.js` (a symlink), and conformance's `mermaid-v12` resolves to `.pnpm/mermaid@12.2.0`. The package also ships `src/{layout,diagram,circleintersection}.js` with vitest specs (6, 2 and 14 tests), which can be ported as solver tests.
- LICENSE is MIT: `Copyright (c) 2013 Ben Frederickson`, `Copyright (c) 2021 Samuel Gratzl`.
- **`bisect`, `nelderMead`, `wolfeLineSearch`, `conjugateGradient`, `zeros`, `norm2` and friends (L270–622) are bundled from `fmin`** (`src/layout.js:1` imports `fmin`; devDep `fmin@0.0.4`, patched). fmin is benfred/fmin. Its licence per npm is BSD-3-Clause, not verified locally because fmin is not installed anywhere here.
- Function ranges:

| Function | Lines |
| --- | --- |
| `intersectionArea` (+ helpers `containedInCircles`, `getIntersectionPoints`, `circleArea`, `distance`, `circleOverlap`, `circleCircleIntersection`, `getCenter`) | 18–150 (151–269) |
| Nelder–Mead `nelderMead` | 339–487 |
| conjugate gradient `wolfeLineSearch` + `conjugateGradient` | 488–549, 550–622 |
| `venn` (driver; `maxIterations` 500; `addMissingAreas` → initial → `nelderMead` on `lossFunction`) | 623–673 |
| `distanceFromIntersectArea`, `addMissingAreas` (missing pairs = 0), `getDistanceMatrices` | 684–808 |
| constrained MDS `constrainedMDSGradient`, `bestInitialLayout`, `constrainedMDSLayout` | 809–847, 848–872, 873–933 |
| **`Math.random`**: `zeros(distances.length * 2).map(Math.random)` | **897** |
| greedy layout `greedyLayout` | 934–1078 |
| `lossFunction`, `logRatioLossFunction` | 1079–1133 |
| `normalizeSolution` (+ `orientateCircles` 1134, `disjointCluster` 1203, `getBoundingBox` 1257) | 1273–1371 |
| `scaleSolution` | 1372–1416 |
| `VennDiagram` (defaults L1450–1456: 600×350, padding 15, π/2) | 1449–1812 |
| `wrapText` (`maxLines = 3` L1820, `getComputedTextLength` L1847) | 1813–1873 |
| `circleMargin`, `computeTextCentre`, `getOverlappingCircles`, `computeTextCentres` | 1874, 1902–1979, 1980, 2004–2043 |
| `circlePath`, `intersectionAreaArcs`, `arcsToPath`, `intersectionAreaPath` | 2090, 2109, 2118, 2142–2145 |
| `layout()` (padding 15, `round = 2`, `scaleToFit = false`) | 2146–2213 |

- Quirks for parity: `VennDiagram` drops zero-size single sets and every overlap touching them (L1513–1520). **`layout()` does not**, so the text nodes and hand-drawn circles see the zero sets. `VennDiagram`'s path call passes `round` to `.attr`, not to `intersectionAreaPath` (L1649), so the drawn `d` is unrounded. `layout().path` rounds to 2. The label is at `Math.floor(textCentre)` L1656–1657 with `dy .35em`. Its default text is the set id for a single set and empty for an overlap (L1537–1544). `wrapText` wraps against the **first set's radius**, not the region, and `maxLines` only feeds `minChars` (L1821). Lines are **not** capped at 3. `data-venn-sets = sets.join('_')` L1606. `scaleSolution` returns the solution unscaled when the bounding box has zero size (L1380–1383).
- Node needs no DOM for `venn.layout`; it ran here with plain `node`.

## 10. Oracle

`packages/conformance/src/oracle.ts:60–101`: one `mermaid-v12` import, DOMPurify patched to identity L67–73, then the sequence, quadrant and gantt patches L79–83. **Venn needs no DOM shim to parse.** I ran `loadOracle().parse()` on `set`/`union`/indented `text`/`venn-beta` alone/`set A%% c` in Node 26, with no `window` or `document`. It returned `diagramType: 'venn'` and `getSubsetData()`/`getTextData()`, and the glued comment was rejected as the spec says. Rendering (`vennRenderer`) needs a DOM (d3, `getComputedTextLength`, roughjs svg), and the oracle never renders. For T3 parity, import `@upsetjs/venn.js` directly; it is not a direct conformance dependency today.

## 11. Corpus

- `e2e/diagrams/venn/**/*.mmd` holds **21** files: `pr-check` 10 (+ `.gitkeep`) and `nightly-check` 11, with `visual-check` empty.
- **Hand-drawn (3):** `pr-check/15-…handdrawn-look-and-title.mmd` (`look: handDrawn`, seed 1, courier) and `nightly-check/handdrawn/{14,18}-*.mmd`. `pr-check/3-…title.mmd` mentions hand-drawn only in its description.
- Themes: `nightly-check/9-…dark-theme`, `three-sets-redux-color-theme`, `three-sets-redux-dark-color-theme` and `explicit-set-style-over-redux-palette`.
- Registry row: **`packages/mermaid/src/generated/registry.gen.ts:148`** `{ type: 'venn', pattern: /^\s*venn-beta/ }`, after railroadPeg L147 and before wardley L149. The spec's `:103` is stale. Its source is `tools/gen-config/src/registry.ts:61`.

## 12. The reference implementation

There is **no the reference implementation install in this worktree**. `pele@1.13.0` is a devDependency of `packages/bench/package.json:44` and is installed in `.claude/worktrees/t486/node_modules/.pnpm/pele@1.13.0` (also in `.tmp/{wt-272,perf-verify,t423rf-e2e}`). Only `dist/diagrams/venn/*.d.ts` (`db`, `layout`, `lexer`, `parser`, `render`, `types`) is readable. The JS is a minified chunk (`dist/esm/diagrams/venn.js` → `chunks/55GM72UB.js`). MIT.
