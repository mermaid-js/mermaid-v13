# 01: v12 ishikawa, pointer notes (spec #519)

Read with `git show fa796a943:<path>`. `D` = `packages/mermaid/src/diagrams/ishikawa/`. 774 lines total; equal to `mermaid@12.2.0`.

## Files

`D/parser/ishikawa.jison` (56), `D/ishikawaDb.ts` (96), `D/ishikawaRenderer.ts` (513), `D/ishikawaStyles.ts` (68), `D/ishikawa.spec.ts` (66), `D/ishikawaTypes.ts` (4: `IshikawaNode { text, children }`), `D/ishikawaDetector.ts` (22: `/^\s*ishikawa(-beta)?\b/i` at :10, lazy loader :13), `D/ishikawaDiagram.ts` (15: `get db()` gives a fresh `IshikawaDB` per diagram, :10).

## Grammar (`D/parser/ishikawa.jison`)

- Lexer :1-15, `%options case-insensitive` :2, no start conditions. Rules in order: `\s*\%\%.*` SPACELINE :6; `"ishikawa-beta"` :7 and `"ishikawa"` :8 ISHIKAWA (quoted literals: jison adds `\b` only after word chars, so `ishikawa-betax` lexes as `ishikawa` + TEXT `-betax`); `[\s]+[\n]` SPACELINE :9; `[\n]+` NL :10; `[\s]+` SPACELIST :11; `[^\n]+` TEXT :12; `<<EOF>>` EOF :13.
- Rules :21-55: `start` :21 (`ishikawa` or `spaceLines ishikawa`); `spaceLines` :26; `ishikawa` :32 (`ISHIKAWA document` | `ISHIKAWA NL document`); `stop` :37 (NL, EOF, SPACELINE, `stop NL`, `stop EOF`); `document` :45 (left-recursive `statement stop`); `statement` :50: `SPACELIST TEXT` → `yy.addNode($1.length, $2.trim())` :51, `TEXT` → `addNode(0, …)` :52, bare SPACELINE :53, bare SPACELIST :54.
- Note: jison takes the first rule that matches, not the longest. Rule :9 takes any blank run with a `\n` after its first character (backtracking to the last `\n`), rule :10 a leading `\n`, so SPACELIST never holds `\n`; but `\s` also takes `\t`, `\v`, `\f`, U+00A0, U+2028/2029 etc., each counting 1 toward `$1.length` (tabs = 1 column; `LINE_SEPARATORS` cases matter here).

## DB (`D/ishikawaDb.ts`)

- State :21-23 (`root`, `stack`, `baseLevel`); `clear()` :31 also calls commonDb `clear`.
- `addNode(rawLevel, text)` :42: `label = common.sanitizeText(text, getConfig())` :43. First call = effect: root, stack `[{level 0}]`, `setDiagramTitle(label)` :45-49 (raw level ignored).
- Baseline: `this.baseLevel ??= rawLevel` :55 (first cause); `level = rawLevel - baseLevel + 1`, clamped to 1 when ≤ 0 :57-60. Pop while `stack.length > 1 && top.level >= level` :63; push child :67-70.
- acc title/description and title passthroughs :73-95; nothing in the grammar calls `setAccTitle`/`setAccDescription`. DB never throws.

## Renderer (`D/ishikawaRenderer.ts`)

Constants: `FONT_SIZE_DEFAULT = 14` :19, `SPINE_BASE_LENGTH = 250` :20, `BONE_STUB = 30` :21, `BONE_BASE = 60` :22, `BONE_PER_CHILD = 5` :23, `ANGLE = 82°` :24, `COS_A`/`SIN_A` :25-26. Inline literals: padding default 20 :49, first pair offset `-20` :97, pool `250 * 2` :109, min side `250 * 0.3` = 75 :110, `minSpacing = fontSize * 2` :115, head min 60×40 and `+6`/`×2 + 40` :191-192, head control `w * 2.4` :194, head text nudge `+3` :210, label offset `11` :279, box pad `±20`/`±2` :287-309, arrow size `s = 6` :328, wrap 15 :242, head wrap `max(6, floor(110 / (fontSize * 0.6)))` :175, line height `fontSize * 1.05` :467.

- `applyPaddedViewBox` :28: `getBBox()` of the whole svg + pad; `configureSvgSize(svg, h, w, maxW)`.
- `draw` :36. No root → return :39 (an svg with no viewBox). Font size = `parseFontSize(config.fontSize)[0] ?? 14` :45 (16 by default; CSS draws `themeVariables.fontSize`). `useMaxWidth = config.ishikawa?.useMaxWidth ?? false` :50 (runtime config is `true`, see Config).
- Marker (non-handDrawn only) :64-78: `marker#ishikawa-arrow-<id>` in `g.ishikawa > defs`, viewBox `0 0 10 10`, refX 0 refY 5, `markerWidth/Height 6`, `orient auto`, `path "M 10 0 L 0 5 L 10 10 Z" .ishikawa-arrow`. No `markerUnits`, so it scales by stroke width: 12 px on branches (stroke 2), 6 px on sub-branches (stroke 1). Applied as `marker-start` to every `line.ishikawa-branch, line.ishikawa-sub-branch` :146-147, never the spine.
- Spine: zero-length line at (0, 250) :84-86, `y1/y2 = spineY` :120-121, `x1 = last spineX` :145 (handDrawn draws it last, :142-143; no-causes case :89-95).
- Sides :99-117: even-index causes upper (`dir -1`), odd lower. `sideStats` :152 (descendant `total` and `max` per side). If `descendantTotal > 0`: `len = max(75, 500 × side/total)` :108-113, else both stay 250. Then `len = max(len, side.max × 2 × fontSize)` :116-117. `spineY = max(upperLen, 250)` :119; head group re-translated to `(0, spineY)` :123.
- Pairs :125-140: `g.ishikawa-pair` per pair; upper then lower `drawBranch`. Next pair's `spineX` = min `getBBox().x` over all `text` in the pair (sub-cause labels included, label boxes not) :136-139. First pair starts at `x = -20` :97.
- `drawHead` :167: `g.ishikawa-head-group` translated; label via `drawMultilineText(wrapText(label, maxChars), 'ishikawa-head-label', 'start')` :181; `w = max(60, tb.width + 6)`, `h = max(40, tb.height * 2 + 40)` :191-192; path `M 0 -h/2 L 0 h/2 Q 2.4w 0 0 -h/2 Z` :194 inserted first; text transform `translate((w - tb.width)/2 - tb.x + 3, -tb.y - tb.height/2)` :210.
- `flattenTree(children, direction)` :232: one entry per descendant of a cause (`depth` starts at 2 :261, `text = wrapText(text, 15)` :242, `parentIndex`, `childCount`). Upper side (`-1`) reverses each sibling list :236. Even depth: slot pushed pre-order :246-250; odd: post-order :252-258.
- `drawCauseLabel` :265: `g.ishikawa-label-group`, text `ishikawa-label cause` at `(x, y + 11·dir)` anchor middle :275-283, NOT wrapped (only `<br>`/`\n` split); `rect.ishikawa-label-box` = text bbox ± 20 x, ± 2 y :304-309.
- `drawBranch` :345: `lineLen = length × (children ? 1 : 0.2)` :356; end = start + `(-cos82·len, sin82·len·dir)` :357-360; `line.ishikawa-branch` :362; label :366. Slots: every descendant `i` of the cause gets `y = startY + dy × (slot+1)/(n+1)`, n = all descendants of the cause (not per parent) :373-377. Bone map seeded with the cause bone at key -1 :379-387.
  - Even depth (horizontal) :402-412: `bx0 = lerp(parent.x0, parent.x1, (y - parent.y0)/dyP)` (0.5 if `dyP = 0`); `bx1 = bx0 - (childCount ? 60 + 5·childCount : 30)`; `line.ishikawa-sub-branch`; text `ishikawa-label align` anchor end at `(bx1, y)`.
  - Odd depth (diagonal) :413-424: `k = parent.childrenDrawn++`; `bx0 = lerp(parent.x0, parent.x1, (childCount - k)/(childCount + 1))`, `by0 = parent.y0`; `bx1 = bx0 - cos82 × (y - by0)/(sin82·dir)`; text class `ishikawa-label up` (upper) or `down` (lower) :391, anchor end.
  - Nodes with children become parent bones :426-435. Each entry gets its own `g.ishikawa-sub-group` :396 (directly under the pair, not nested).
- Text helpers: `splitLines` on `<br\s*\/?>|\n` :439; `wrapText(text, maxChars)` :441 (no-op when `length ≤ max`, else greedy by words, never splits a word; counts `<br>` characters); `drawMultilineText` :457 (`tspan`s, `dy = 1.05·fontSize`, first line at `y - (n-1)·lh/2`); `lerp` :483; `drawLine` :485.
- Hand-drawn (`look === 'handDrawn'` :46, `rough.svg(svg)` :54, `seed = handDrawnSeed ?? 0` :58, colours `themeVariables.lineColor ?? '#333'` / `mainBkg ?? '#fff'` :59-60): head `roughSvg.path` :196-205 and label box `roughSvg.rectangle` :286-301 with `{ roughness 1.5, fill mainBkg, fillStyle 'hachure', fillWeight 2.5, hachureGap 5, stroke lineColor, strokeWidth 2 }`; lines `roughSvg.line` `{ roughness 1.5, strokeWidth 2 }` :495-501 (class set on rough's `g`); arrows `drawArrowMarker` :314 (triangle tip at the start, length 12, half-width 6, `{ roughness 1, fillStyle 'solid', strokeWidth 1 }` :334-341), called at :364, :410, :421. Text never sketched.

## Styles (`D/ishikawaStyles.ts`)

Spine/branch/sub-branch `stroke lineColor, width 2, fill none` :4-10; sub-branch width 1 :12-14; `.ishikawa-arrow fill lineColor` :16; head and label box `fill mainBkg, stroke lineColor, width 2` :20-30; `text` family/size/fill from `fontFamily`, `fontSize`, `textColor` :32-36; head label 600, middle/middle, `14px` :38-43; `.ishikawa-label` end :45; `.cause` middle/middle :49; `.align` end/middle :54; `.up` baseline :59; `.down` hanging :63.

## Specs and other sources

- `D/ishikawa.spec.ts`: basic hierarchy :13; unindented root :32; effect indented more than causes :49. Fresh `IshikawaDB` per test :8.
- Syntax page `packages/mermaid/src/docs/syntax/ishikawa.md` (generated `docs/syntax/ishikawa.md`): one fence :13-34 (the 4-cause Blurry Photo example; note the effect and causes share 4-space indent), three bullet rules :36-38. Title says "v11.12.3+".
- `packages/examples/src/examples/ishikawa.ts`: `id: 'ishikawa'` :4, example 1 (Blurry Photo, = docs fence plus a leading `\n`) :11-32, example 2 (Late Food Delivery) :36-53.
- `packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts:126`: `ishikawa-beta / Root Cause / Category A / Cause 1 / Category B / Cause 2`.
- Beta policy: `packages/mermaid/src/diagram-api/diagram-beta-policy.spec.ts:57` (`GRADUATED_DIAGRAMS`: `ishikawa` and `ishikawa-beta` both detected). Orchestration order `diagram-api/diagram-orchestration.ts:115` (after `radar`, before `treemap`).
- Demo page `demos/ishikawa.html`.

## Config (v12)

- `packages/mermaid/src/schemas/config.schema.yaml:425` (`ishikawa: $ref IshikawaDiagramConfig`), block :1240-1257: `diagramPadding` integer default 20 min 0; `useMaxWidth` boolean default `false`. `BaseDiagramConfig` :476 has `useMaxWidth` default true.
- `defaultConfig.ts:318` spreads `defaultConfigJson.ishikawa`; defaults come from `.build/jsonSchema.ts:72-91` (ajv `useDefaults` over the `allOf` base first), which is the likely reason the runtime value is `true` while the schema says `false` (spec's claim; not re-run here).

## e2e corpus (this checkout, `e2e/diagrams/ishikawa/`)

pr-check (11):
- `1-should-render-a-simple-ishikawa-diagram.mmd`: Blurry Photo, Process/User, one sub-cause each (2-space effect).
- `2-should-render-with-many-causes-on-both-sides.mmd`: Manufacturing Defect, 4 causes with 1-2 sub-causes.
- `3-should-render-with-deeply-nested-causes.mmd`: Server Outage, 3 levels (Hardware→Disk→…).
- `4-should-render-with-a-single-cause.mmd`: Problem, one leaf cause.
- `5-should-render-with-no-children-root-only.mmd`: effect only.
- `6-should-render-with-handdrawn-look.mmd`: fixture 1 with `look: handDrawn`.
- `7-should-render-with-forest-theme.mmd`: fixture 1, `theme: forest`.
- `8-should-render-with-dark-theme.mmd`: fixture 1, `theme: dark`.
- `9-should-render-with-custom-diagrampadding.mmd`: fixture 1, `ishikawa.diagramPadding: 50`.
- `12-should-render-correctly-when-effect-is-indented-more-than-causes.mmd`: all lines at 2 spaces, so every line after the effect is a flat cause (no clamp exercised, despite the name).
- `13-should-render-a-very-deep-nested-diagram.mmd`: 12 causes, a 7-deep chain (one 3-space indent), wide 8- and 6-child levels, duplicate `2-2-2-1`.

nightly-check (2): `should-render-usemaxwidth-true.mmd` / `-false.mmd`: 4-space effect, causes at 8, sub-causes at 12, with `ishikawa.useMaxWidth` set. `visual-check/` is empty; no `baseline/` yet.

## Behaviours worth a test that the spec states loosely

- When every cause is a leaf (`descendantTotal = 0`), both sides are 250, not a 500 split (:108).
- Slot spacing is over all of a cause's descendants on the cause bone, not per parent bone (:373-377).
- Arrowheads are 12 px on cause bones and 6 px on sub-bones (marker scales with stroke width).
- Cause (depth-1) labels never wrap by count; only effect (11 at 16 px) and depth ≥ 2 (15) do; long single words never split.
- The next pair starts at the leftmost text x of the previous pair, so the previous box (20 px wider) can overlap the next bone.
