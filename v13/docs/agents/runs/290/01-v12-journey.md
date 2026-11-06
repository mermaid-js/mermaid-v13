# v12 user journey (oracle `fa796a943`)

Read with `git show fa796a943:packages/mermaid/src/diagrams/user-journey/<file>` (J below). `git ls-tree` lists 9 files:
`journeyDb.js journeyDb.spec.js journeyDetector.ts journeyDiagram.ts journeyRenderer.ts parser/journey.jison parser/journey.spec.js styles.js svgDraw.js`.

## Detector and wiring
- `journeyDetector.ts:10` `/^\s*journey/` (case-sensitive, no `\b`), id `journey`; lazy loader L13-16.
- Detection order: `diagram-api/diagram-orchestration.ts:106-107` registers `journey` right before `quadrantChart` (after `stateDiagram`).
- `journeyDiagram.ts:13-16` `init`: `renderer.setConf(cnf.journey)` then `db.clear()`.

## parser/journey.jison (69 lines)
Lexer L6-36. `%options case-insensitive` L7. Exclusive states `%x acc_title` L8, `acc_descr` L9, `acc_descr_multiline` L10. jison takes the **first rule that matches, in file order** (not longest). INITIAL rules (no `<state>` prefix, so not active inside the `%x` states):
- L14 `\%%(?!\{)[^\n]*` skip (a `%%{` directive is not a comment here).
- L15 `[^\}]\%\%[^\n]*` skip: eats the one character before `%%` (only reached when L14 failed, i.e. mid-token).
- L16 `[\n]+` NEWLINE; L17 `\s+` skip (so blanks then `\n` never yield NEWLINE); L18 `\#[^\n]*` skip.
- L20 `"journey"`; L21 `"title"\s[^#\n;]+` → `title` (the `\s` may be `\n`; value may hold `:`).
- L22 `accTitle\s*":"\s*` begin acc_title; L23 `<acc_title>(?!\n|;|#)*[^\n]*` pop, `acc_title_value`. L24/L25 same for `accDescr:`.
- L26 `accDescr\s*"{"\s*` begin multiline, **returns no token**; L27 `<acc_descr_multiline>[\}]` pop, no token; L28 `[^\}]*` → `acc_descr_multiline_value`.
- L29 `"section"\s[^#:\n;]+` → `section` (no `:` allowed, so `section A: b` fails).
- L30 `[^#:\n;]+` → `taskName`; L31 `":"[^#\n;]+` → `taskData`; L32 `":"` → `':'` (no grammar rule uses it); L33 `<<EOF>>` EOF; L34 `.` INVALID (`;` lands here).
- Order traps: `journey`/`title `/`section ` beat `taskName`, so `journey planning: 5`, `Title x: 5` are keyword lines; `taskData` needs ≥1 char after `:` (`Task:` alone = `':'` → error).

Grammar L38-67 (`%left '^'` L38 unused): `start: journey document EOF` L45; `line: SPACE statement` L54 (no lexer rule emits SPACE: dead) `| statement | NEWLINE | EOF` L54-57. `yy` calls (statement L60-67):
- `title` → `yy.setDiagramTitle($1.substr(6))` L61 (untrimmed; `title  X` keeps one leading blank).
- `acc_title acc_title_value` → `yy.setAccTitle($2.trim())` L62; `acc_descr ...` → `yy.setAccDescription($2.trim())` L63; multiline → `yy.setAccDescription($1.trim())` L64.
- `section` → `yy.addSection($1.substr(8))` L65 (untrimmed).
- `taskName taskData` → `yy.addTask($1, $2)` L66 (name untrimmed: trailing blanks kept, leading blanks eaten by L17).
- Lexer actions never read `yy`.
- `commonDb.ts` (`diagrams/common/commonDb.ts`): `setAccTitle` L16-18 sanitises + strips leading blanks; `setAccDescription` L22-24 sanitises + `/\n\s+/g`→`\n`; `setDiagramTitle` L28-30 sanitises only.

## journeyDb.js (130 lines): module singleton, not a class
- Module state L12-16: `currentSection = ''`, `sections[]`, `tasks[]`, `rawTasks[]`. `clear` L18-24 resets all + `commonClear()`.
- `addSection` L26-29: sets `currentSection`, pushes to `sections` (empty and repeated sections kept).
- `addTask(descr, taskData)` L61-84: `pieces = taskData.substr(1).split(':')` L62; `score = Number(pieces[0])` L67/L70 (`' '`→0, `'0x10'`→16, `'2rem'`→NaN); people = `pieces[1].split(',')` L71 only when ≥2 pieces, trimmed L73 (`Task: 5:` → `['']`; pieces[2+] ignored). Pushes `{section, type: section, people, task, score}` L75-83 to `rawTasks`.
- `getTasks` L35-47: `compileTasks` L97-109 never sees `processed` set, so it loops 100 extra times (no effect); then `tasks.push(...rawTasks)` L44: **every call appends the raw tasks again**.
- `getActors` L111-113 → `updateActors` L49-59: reads `tasks` (not `rawTasks`), so it is `[]` until `getTasks()` ran; unique, `.sort()` (code-unit order).
- `addTaskOrg` L86-95 dead. Default export L115-130; `getConfig` L116 = `getConfig().journey`.

## journeyRenderer.ts (356 lines)
Module state: `actors {}` L15, `maxWidth` L16, `conf = getConfig().journey` at module load L119 (mutated by `setConf` L7-13), `leftMargin` L120, `fills = conf.sectionFills` L281 and `textColours = conf.sectionColours` L282 captured at module load (setConf replaces the array, so later values never reach `fills`).
- `draw` L121-198: `getTasks()` L144 once, then `getActors()` L147. Actor colour `conf.actorColours[pos % len]`, `position: pos` L152-158 (sorted order, so `''` sorts first and takes colour 0).
- `drawActorLegend` L19-116 (uses fresh `getConfig().journey`): rows from `yPos = 60` L23; dot `cx 20, cy yPos, r 7, stroke #000, class actor-<pos>` L27-35; measures text with hidden `<text>` getBoundingClientRect L38-39; fits if `≤ maxLabelWidth` L45, else word wrap L49-85 with per-char hyphen split `brokenWord + '-'` L66-80. Lines at `x 40, y yPos + 7 + i*20`, `textMargin = boxTextMargin ?? 5` L94-101. Widening rule L109: `lineWidth > maxWidth && lineWidth > conf.leftMargin - lineWidth` (i.e. > leftMargin/2). Row advance `max(20, lines*20)` L114. Iterates `Object.keys(actors)`: integer-like actor names (`1`, `42`) come first, ahead of the sorted order used for colours.
- `leftMargin = conf.leftMargin + maxWidth` L161; `bounds.insert(0, 0, leftMargin, nActors * 50)` L162.
- Title L166-176: `<text x=leftMargin y=25 font-size=titleFontSize font-weight=bold fill=titleColor font-family=titleFontFamily>`.
- Size L178-179: `height = stopy - starty + 2*diagramMarginY`; `width = leftMargin + box.stopx + 2*diagramMarginX` (stopx already includes leftMargin: counted twice). `configureSvgSize(diagram, height, width, useMaxWidth)` L181 (`setupGraphViewbox.js:23-33`: 100% + `max-width` or width/height attrs).
- Activity line L184-192: `x1 leftMargin, y1=y2 = conf.height*4` (200), `x2 = width - leftMargin - 4`, `stroke-width 4`, `stroke black`, `marker-end url(#<id>-arrowhead)`.
- viewBox L194-197: `extra = title ? 70 : 0`; `viewBox="${startx} -25 ${width} ${height+extra}"`; `preserveAspectRatio xMinYMin meet`; `height` attr `height+extra+25` (overrides configureSvgSize's).
- `bounds` L200-279 (copied from sequence): `updateBounds` loops `sequenceItems`, always `[]`, so `boxMargin` has no effect L227-255.
- `drawTasks` L284-351 (fresh getConfig): `sectionVHeight = 2*height + diagramMarginY` L287 (110); a band starts when `task.section !== lastSection` L297 (`lastSection` starts `''`: tasks before any section get **no band**, fill `#CCC`, num 0, colour black L291-293); slot `sectionNumber % fills.length` (7) L298-300 counts bands, not section lines (A,B,A = 3 bands; empty sections draw nothing); band `x = i*taskMargin + i*width + leftMargin` (i = first task index), `y 50`, `taskCount` consecutive L313-321. Task `x` same formula L338, `y = taskPos`; `task.width = diagramMarginX`, `task.height = diagramMarginY` L340-341 (bounds only); `bounds.insert(x, y, x + diagramMarginX + taskMargin, 450)` L349.

## svgDraw.js (416 lines)
- `drawFace` L8-95: `r 15`, `class face`, `stroke-width 2` L9-17; eyes at `cx ∓ 5, cy - 5`, `r 1.5`, fill+stroke `#666` L22-39. Mouth by raw score L86-92: `> 3` smile (d3 arc π/2→3π/2, inner `15/2`=7.5, outer `15/2.2`≈6.82, translate `(cx, cy+2)`) L42-54; `< 3` sad (arc 3π/2→5π/2, translate `(cx, cy+7)`) L57-69; else (3 or NaN) flat `<line class=mouth>` `cx±5` at `cy+7`, `#666`, 1px L72-84.
- `drawCircle` L97-115: `class actor-<pos>`, fill, stroke, r; `<title>` when given; L106 `circleElement.class` check is dead.
- `drawSection` L161-189: `getNoteRect()` (fill `#EDF2AE`, stroke `#666`) then `width = width*taskCount + diagramMarginX*(taskCount-1)` L169-171 (gap uses diagramMarginX, tasks use taskMargin), `height = conf.height`, `class journey-section section-type-<num>`, `rx=ry=3`; label with the same class L178-188.
- `drawTask` L200-262: `center = x + width/2`; module `taskCount` L191 (reset in `initGraphics` L393) gives line id `<id>-task<n>` L206; dashed line `y task.y → 450` (`300 + 5*30`), `4 2`, `#666`, `class task-line` L204-214; face `cy = 300 + (5 - score)*30` L216-220 (score 5 → 300, 1 → 420; no clamp); rect `class task task-type-<num>`, `rx 3` L222-231; dots from `x + 14` every 10 px, `cy = task.y`, `r 7`, stroke `#000`, `<title>` person L233-249 (a dot per mention, `''` included); label `class task` L251-261. Paint order: line, face, rect, dots, label.
- `_drawTextCandidateFunc` L274-390, chosen by `textPlacement` L387-389 (`fo` default, `old` → byText, else byTspan). `byTspan` L307-334: split `/<br\s*\/?>/gi`, `dy = i*taskFontSize - taskFontSize*(n-1)/2`, `fill=colour`, `font-size`/`font-family` as style. `byFo` L346-372: `<switch><foreignObject>` with `div.label` table-cell centred text (`.text()`, so `<br>` is literal), then `byTspan(...)` **without the colour argument** L370 (fallback gets no fill).
- `initGraphics` L392-405: `<defs><marker id=<id>-arrowhead refX 5 refY 2 markerWidth 6 markerHeight 4 orient auto><path d="M 0,0 V 4 L6,2 Z">` (no fill: black).
- `drawLabel` L121-159, `drawBackgroundRect` L270-272: unused by journey.

## diagrams/common/svgDrawCommon.ts pieces journey uses
- `drawRect` L17-46 (x, y, fill, stroke, width, height, rx/ry if truthy, class).
- `drawText` L68-86: replaces `lineBreakRegex` (`common.ts:8`, `/<\/?br\s*\/?>/gi`) with a space, `class legend`, `<tspan x = x + 2*textMargin>` (legend text at 50); ignores `textData.fill` (`#666` passed by the legend is dropped).
- `getNoteRect` L109-122 (defaults above).

## styles.js (139 lines), `getStyles(options)` = theme variables
- `.label` font-family/color L4-7 and L24-26; `.mouth { stroke: #666 }` L8-10; `line { stroke: textColor }` L12-14 (recolours activity line and task-lines; the flat mouth keeps #666 via `.mouth`); `.legend { fill: textColor; font-family }` L16-19; `.label text { fill: #333 }` L21-23.
- `.face` L28-31: `fill: faceColor` else `#FFF8DC`, `stroke: #999`.
- Dead for journey: `.node …` L33-48, `.arrowheadPath` L50-52, `.edgePaths` L54-57, `.flowchart-link` L59-62, `.edgeLabel` L64-70, `.cluster` L72-77, `div.mermaidTooltip` L79-91.
- `fillType` L93-116: `.task-type-<n>, .section-type-<n> { fill: fillType<n> }`; **every rule n=1..7 is gated on `options.fillType0`** (copy-paste). Class CSS beats the `fill` attribute, so `sectionFills` never shows when a theme sets `fillType0` (all do). Section *labels* also carry `section-type-<n>`, so in `tspan` mode their text takes the band fill.
- `actor-0..5` L118-135: `fill: actor<n>` only if set; L136 `getIconStyles()`.

## Config: `JourneyDiagramConfig` (`packages/mermaid/src/schemas/config.schema.yaml` @ fa796a943, L1820-1959)
`allOf BaseDiagramConfig` L1822 (adds `useWidth` L481, `useMaxWidth` default true L483-489). Defaults (line of `default:`): diagramMarginX 50 L1847, diagramMarginY 10 L1850, leftMargin 150 L1854, maxLabelWidth 360 L1859, width 150 L1863, height 50 L1868, boxMargin 10 L1873, boxTextMargin 5 L1878, noteMargin 10 L1883, messageMargin 35 L1888, messageAlign center L1897, bottomMarginAdj 1 L1904, rightAngles false L1913, taskFontSize 14 L1916, taskFontFamily `"Open Sans", sans-serif` L1919, taskMargin 50 L1922, activationWidth 10 L1926, textPlacement fo L1932, actorColours `#8FBC8F #7CFC00 #00FFFF #20B2AA #B0E0E6 #FFFFE0` L1937, sectionFills `#191970 #8B008B #4B0082 #2F4F4F #800000 #8B4513 #00008B` (7) L1942, sectionColours `['#fff']` L1947, titleColor `''` L1951, titleFontFamily `"trebuchet ms", verdana, arial, sans-serif` L1955, titleFontSize `4ex` L1959. 24 own keys.

## Themes (`packages/mermaid/src/themes/theme-*.js` @ fa796a943)
11 themes: base, dark, default, forest, neo, neo-dark, neutral, redux, redux-dark, redux-color, redux-dark-color. **No theme sets `faceColor` or `actor0`–`actor5`** (git grep: none), so v12 always uses `#FFF8DC` and `actorColours`.
fillType0..7 = `primary, secondary, adjust(primary,h+64), adjust(secondary,h+64), adjust(primary,h-64), adjust(secondary,h-64), adjust(primary,h+128), adjust(secondary,h+128)`:
- unconditional: `theme-dark.js:181-188`, `theme-default.js:252-259`, `theme-forest.js:215-222`, `theme-neutral.js:252-259`.
- `this.fillTypeN || …`: `theme-base.js:212-219`, `theme-neo.js:232-239` (local `primaryColor`), `theme-neo-dark.js:245-252`, `theme-redux.js:233-240` (local), `theme-redux-dark.js:259-266`.
- `theme-redux-color.js:309-311`: `fillType<i> || bkgColorArray[i]` (Tailwind-50, array at L74); comment L302-308.
- `theme-redux-dark-color.js:314-326`: fixed 900-shades `#701a75 #134e4a #7c2d12 #581c87 #14532d #4c1d95 #7f1d1d #713f12`; comment L305-313.

## Specs (harvest source)
- `parser/journey.spec.js` (150 lines): 7 `it`s, each one `parser.parse(str)` via `parserFnConstructor` L4-8 = **7 source strings** (title L17, accDescr L23-27, multiline accDescr L32-40 with `}title` glued, accTitle L48-50, section L58-61, `<br>` section L66-69, tasks L75-87). Asserts: acc values L43-45, L53-54; 8 tasks with `people: ['']` for `E/P/Q/R task: 5:` L90-148.
- `journeyDb.spec.js` (92 lines): DB API only, 0 parse calls. Two `clear` tables L9-44 (note `addTask('test1', '4: id1, id3')` lacks the leading `:`, so `substr(1)` drops the score); `tasks and actors should be added` L46-91: `getTasks()` then `getActors()` → `['Child#1','Child#2','Dad','Mum']` (a `#` actor only reachable through the DB, the lexer would comment it).
