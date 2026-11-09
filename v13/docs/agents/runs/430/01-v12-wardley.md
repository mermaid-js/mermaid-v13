# 01: v12 wardley, read at `fa796a943` (#430)

Pointers only. `D/` = `packages/mermaid/src/diagrams/wardley/`, `L/` = `packages/parser/src/language/`, `R` = `D/wardleyRenderer.ts`; lines are `git show fa796a943:<path>`'s.

## Provenance and oracle

- `/Users/knsv/repos/mermaid` has `mermaid@12.2.0` (ee1fdbceb) and `@mermaid-js/parser@2.0.1`; fa796a943 is not there.
  Byte-identical to the tag: all of `D/`, `L/wardley/`, `L/common/`, `examples/wardley.ts`, the five classic themes.
  Differs: `docs/syntax/wardley.md` (fa796a943 adds front matter and a beta warning, `:1-9`; 19 fences in both);
  schema `WardleyDiagramConfig` same text, at `:3084` in the tag vs `:3101` here.
- Oracle (worktree `packages/conformance/node_modules`): `mermaid-parser-v12` 2.0.1 exports `createWardleyServices`
  (`dist/mermaid-parser.core.mjs:27`, `:419`; parse chunk `:249`). `mermaid-v12` 12.2.0 registers `wardley-beta`
  (`dist/mermaid.core.mjs:659-673`, `:823`). Key `Wardley` (`L/wardley/module.ts:62-77`); only the ValueConverter
  is overridden (`module.ts:43-45`), so tokens come from Langium's `DefaultTokenBuilder`.

## Grammar (`L/wardley/wardley.langium`, imports common)

Entry `:4-12`; Statement `:14-27`; Size `:29-31`; Evolution/Stage `:33-39`; Anchor `:41-43`; Component `:45-53`;
Label `:55-57`; Decorator `:59-61`; Link `:63-66`; Evolve `:68-70`; Pipeline `:72-80`; Note `:82-84` (STRING only);
Annotations `:86-88`; Annotation `:90-92`; CoordinateValue `:94-96`; (De)accelerator `:98-104` (fields `x`,`y`, used as
[visibility, evolution]); terminals `:109-154`. common.langium: EOL `:6`, TitleAndAccessibilities `:8-10`, ACC_DESCR
`:14`, ACC_TITLE `:15`, TITLE `:16`, INT `:19`, STRING `:22`, ID `:27`, NEWLINE `:29`, hidden `:31-34`.

**Token order, dumped from the 2.0.1 runtime** (`TokenBuilder.buildTokens`, 43 types): `[ , ] @ / ( ) - { }`
(`-` has LONGER_ALT ARROW, LINK_ARROW, YAML), WARDLEY_NUMBER, ARROW, LINK_PORT, LINK_ARROW, LINK_LABEL, STRATEGY,
KW_WARDLEY…KW_DEACCELERATOR (langium `:118-131` order), NAME_WITH_SPACES (`:143`), WS (skipped), ACC_DESCR,
ACC_TITLE, TITLE, INT, STRING, ID, NEWLINE, WHITESPACE (skipped), YAML, DIRECTIVE, SINGLE_LINE_COMMENT (hidden).
- **Spec correction:** the spec's tail "NEWLINE, hidden YAML/DIRECTIVE/comment, ACC_*, TITLE, FLOAT, INT, STRING, ID"
  is wrong: ACC_*/TITLE/INT/STRING/ID come before NEWLINE, the hidden three are last, FLOAT is unreachable (absent).
- First match wins: STRATEGY and KW_* precede NAME_WITH_SPACES (`buyer`, `notebook`, `labels` split);
  KW_ANNOTATIONS precedes KW_ANNOTATION; INT precedes ID (`1A` = INT + NAME).

## Value conversion

`L/wardley/valueConverter.ts:11-17`: LINK_LABEL → `substring(1).trim()`. `L/common/valueConverter.ts:44-70`:
TITLE/ACC_TITLE trimmed with blank runs collapsed (`:58-60`), multi-line accDescr `:62-68` (`/\s+$/gm`). Else
Langium defaults: STRING unquoted with `\` escapes decoded (`"a\nb"` gives a newline, probed), WARDLEY_NUMBER and
INT to numbers (`00.5` = 0.5), NAME_WITH_SPACES raw (inner blank runs kept). `inertia?=` is `false` when absent
on a component, absent on anchors (probed).

## Population (`D/wardleyParser.ts:68-227`); first throw stops v12

- `toPercent` `:8-17` (`v <= 1 ? v*100 : v`); message `${ctx} must be between 0-1 (decimal) or 0-100 (percentage).
  Received: ${value}` `:12-14`. `toCoordinates(vis, evo, ctx)` `:19-28` checks `${ctx} evolution` first.
- Order is by category, not source: title/acc `:69` (`common/populateCommonDb.ts:4-14`), size `:72-74`, evolution
  `:77-90` (`"a / b"` `:81`; boundaries only from `@` stages `:85-87`), anchors `:93-96` `Anchor "<n>"`, components
  `:99-129` `Component "<n>"`, notes `:132-135` `Note "<text>"`, pipelines `:138-171` (throw `Pipeline "<p>" must
  reference an existing component with coordinates.` `:141-143`, by id so an anchor parent passes; child id
  `${parent}_${name}` `:150`; `Pipeline component "<n>" evolution` `:157`), links `:174-187`, evolves `:190-197`
  `Evolve target for "<n>"` (unknown id skipped **before** the range check: no throw), annotations box `:200-204`
  (first only) `Annotations box`, annotations `:207-210` `Annotation <n>`, `Accelerator "<n>"` `:213-216`,
  `Deaccelerator "<n>"` `:219-226`.
- Links: dashed iff arrow has `-.->` (`.-.` dead) `:175`; flow = from-port ?? to-port ?? arrow `:177-181`
  (`:30-66`); label = `+'x'` ?? `; x` `:183-184`; ends `resolveNodeId` `:186`.
- `Node "<label>" is missing coordinates` (`D/wardleyBuilder.ts:191`) is unreachable.

## Builder (`D/wardleyBuilder.ts`) and DB (`D/wardleyDb.ts`)

- `addNode` `:92-102`: only className and labelOffsetX/Y fall back with `??`; `inertia`, `sourceStrategy` are
  overwritten by a later same-id add. Map keeps the first position (anchors, components, pipeline children).
  Trends Map last-wins `:108-110`; `startPipeline` resets children, sets `isPipelineParent` `:112-120`; old children
  keep `inPipeline` `:122-133`; `resolveNodeId` id → first label → name `:175-185`; `setAxes` merge `:155-160`;
  `setSize` last wins `:162-164`; `build()` `:187-208`, shape `WardleyBuildResult` `:65-77` (node `:1-13`,
  link `:15-21`, trend `:23-27`: targetY is node.y at evolve time).
- DB: module singleton `builder` `:14`; adapter reads `getWardleyData()` `:124-126`, `getDiagramTitle`,
  `getAccTitle`, `getAccDescription` (`:151-156`). `getConfig()` `:16-18` = `getGlobalConfig()['wardley-beta']`.

## Renderer constants (`R`): the spec's metrics list checked

Confirmed: defaults `:52-65`; square 1.6·r `:72`; title `:151-163`; projection `:165-166`; stage labels axis−2
at H−p/1.5, dividers `5 5`/0.8 (`#000`) `:240-270`; custom widths only if `boundaries.length === stages.length`, raw
fractions `:222-238`; grid `2 6`, i = 1..3 `:273-295`; links `6 6`, ends shortened r or square/√2 `:404-472`; label 8 px
off, rotated, flipped beyond ±90 `:475-530`; trends `4 4`, shortened r+2 only when longer `:540-582`; box ±15,
4r, rx 4, stroke 1.5 (`axisColor`, fill none) `:353-378`; overlays 2r (`#666`/`#ccc`/`#eee`+`#000`/`white`)
`:597-644`; market dots 0.7r at 1.2r, stroke 2 `:661-729`; inertia 6 at r+15 (+r+10), parent square/2+15
`:744-777`; labels (+off, −off) ±10 only without `label` `:779-823`; annotation box 11 px, 16, pad 10, max+20+105,
clamped `:881-955`; notes 11 bold `:959-976`; accelerators 60×30, head 20, ±8, label 10 bold at y+30 `:979-1066`;
markers 6×6 / 5×5 `:93-138`.
- **Wrong in spec:** "parent moved to the box's centre": x is the centre, y is boxTop − square/6 `:359-364`.
- **Missing from spec's list:** axis labels at (p+cw/2, H−p/4) and (p/3, p+ch/2) rotated `:186-212`; anchor label
  centred, bold, y−3, `#000` `:784-822`; annotation markers r 10, white, axisColor 1.5, number 10 bold `:853-877`;
  box height n·16+20+maxBBoxHeight/2 `:926`; pipeline joins `4 4` by x `:316-337`; main circle skipped for parent,
  market, anchor `:647-658`.
- **Self-links are drawn with NaN** (distance 0; filter `:390-403` only drops unknown ends and child→own parent);
  spec says "not drawn". **Trend from a pipeline parent is not horizontal** (origin moved, target `projectY(node.y)`
  `:540-547`), against the T3 invariant. Dead `'evolved'` `:811`. Wipe `:85`; `<defs>` after the map `:93`.

## Theme

- Fallbacks `R:31-50`: background → `#fff`; axis, strokes, links, annotationStroke `#000`; text → primaryTextColor →
  `#222`; grid `rgba(100, 100, 100, 0.2)`; fills `#fff`; evolution `#dc3545`; annotationFill → background → `#fff`.
  The annotation vars are read and unused (the box and markers draw white, axisColor, axisTextColor).
- Blocks: default `:356-371`, base `:291-306`, dark `:351-366` (fills `mainBkg`, `#ff6b6b`), forest `:328-343`,
  neutral `:363-378`. None in redux*/neo*. `D/styles.ts:21-88` is wiped; it gives the box componentStroke, unlike `R`.

## Group order (children of `g.wardley-map`; `?` = conditional)

`rect.wardley-background` `:140`, `text.wardley-title`?, `g.wardley-axes` (`.wardley-axis-label
.wardley-axis-label-x|-y`), `g.wardley-stages` (`.wardley-stage-label`), `g.wardley-grid`?, `g.wardley-pipelines`?
(`.wardley-pipeline-box`), **`g.wardley-pipeline-links`?** (`.wardley-pipeline-evolution-link`; not in the spec),
`g.wardley-links` (`.wardley-link`, `--dashed`, `.wardley-link-label`), `g.wardley-trends` (`.wardley-trend`),
`g.wardley-nodes` (`g.wardley-node wardley-node--<class>`, `.wardley-{outsource,buy,build,market}-overlay`,
`.wardley-market-line|dot`, `.wardley-inertia`, `.wardley-node-label`), `g.wardley-annotations`?
(`g.wardley-annotation`, nested `g.wardley-annotations-box`), `g.wardley-notes`?, `g.wardley-accelerators`?,
`g.wardley-deaccelerators`?.

## Config, specs, docs, examples

- Schema (`packages/mermaid/src/schemas/config.schema.yaml`): `wardley-beta:` `:449`; def `:3101-3153`, required
  `:3107-3113` (no nodeLabelOffset, showGrid); minimum 1 for width/height, 0 otherwise; useMaxWidth from Base.
- Specs: `D/wardleyParser.spec.ts` 20 `it` (`:15-333`, none rejects); `D/wardleyBuilder.spec.ts` 4. Examples file 4.
  Syntax page 19 fences; claims `[1100, 600]` default `:66` (code 900×600), strategy shapes `:156-159`
  (code: circles), trend form `-.-` `:233` (not in the grammar).

## e2e fixtures (`e2e/diagrams/wardley/`)

10 `.mmd` in `pr-check/` (other dirs `.gitkeep`; no `baseline/`), as the spec says: 1 tea shop (anchors, `label`,
evolve, 3 notes); 2 custom stages; 3 pipeline (child by label, children → parent); 4 `->`, `+>`, `; x`, `+<>`, `+<`,
`+'backup'>`; 5 `size [600, 800]`; 6 GPT tokeniser (~30 components, 3 pipelines, deaccelerator, `annotations [1, 0]`,
5 annotations, note); `theme-test-{base,dark,forest,neutral}`.
