# 01 — v12 timeline pointer notes (spec #291)

`$REF` is the reference implementation's checkout (D770).

`V=fa796a943:packages/mermaid/src/diagrams/timeline`, `TH=fa796a943:packages/mermaid/src/themes`. Read with `git show $V/<file>`.
v12.2.0 dist (the oracle) matches: `node_modules/.pnpm/mermaid@12.2.0/node_modules/mermaid/dist/chunks/mermaid.core/timeline-definition-JXYKGLGB.mjs`.
Probe results below marked (probed) came from running that chunk's parser with `parser.yy = diagram.db` in node.

## 1. Grammar — `$V/parser/timeline.jison`

- L7 `case-insensitive`; L8–10 exclusive states `acc_title`, `acc_descr`, `acc_descr_multiline`.
- jison appends `\b` to a rule ending in a word char (no `flex` option): `timeline`, `timeline LR`, `timeline TD` are word-bounded (probed: `Timelines : x` is a period, `timeline LRx` is `timeline` + period `LRx`).
- Lexer rules in order (first match wins, not longest):
  - L14 `\%%(?!\{)[^\n]*` skip (compiles to a single `%`; only reached at token start). v12 strips whole `%%` lines before lexing (`code.cleaned`, `fa796a943:packages/mermaid/src/Diagram.ts:56`).
  - L15 `[^\}]\%\%[^\n]*` skip: any char (newline included) then `%%`.
  - L16 `[\n]+` → `NEWLINE`. L17 `\s+` skip (also eats newlines that follow spaces, so NEWLINE is not reliable; the grammar needs no separator).
  - L18 `\#[^\n]*` skip: `#` at token start is a comment (so a period stops at `#` and the rest of the line goes).
  - L20 `timeline[ \t]+LR` → `timeline_lr`; L21 `…TD` → `timeline_td`; L22 `timeline` → `timeline`.
  - L23 `"title"\s[^\n]+` → `title` (`\s` can be `\n`, so a bare `title` eats the next line).
  - L24 `accTitle\s*":"\s*` begin `acc_title` → `acc_title`; L25 `<acc_title>(?!\n|;|#)*[^\n]*` pop → `acc_title_value`.
  - L26/L27 same pair for `accDescr:` → `acc_descr`, `acc_descr_value`.
  - L28 `accDescr\s*"{"\s*` begin `acc_descr_multiline` (no token); L29 `<…>[\}]` pop; L30 `<…>[^\}]*` → `acc_descr_multiline_value`.
  - L31 `"section"\s[^:\n]+` → `section` (bare `section` eats the next line up to `:`).
  - L34 `":"\s(?:[^:\n]|":"(?!\s))+` → `event` (`:` followed by whitespace ends it; `\s` can be `\n`).
  - L35 `[^#:\n]+` → `period` (keeps trailing spaces: `"2002 "`).
  - L38 `<<EOF>>` → `EOF`; L39 `.` → `INVALID`.
- Parse rules: L49–51 `start: timeline_header document EOF` (returns `$2`); L53–57 header (L55 `setDirection('LR')`, L56 `'TD'`; bare `timeline` calls nothing).
- L59–62 `document` left-recursive list; L64–69 `line: SPACE statement | statement | NEWLINE | EOF`. `SPACE` is never emitted by the lexer.
- L71–79 statements: L72 `title` → `getCommonDb().setDiagramTitle($1.substr(6))`; L73 acc title → `setAccTitle($2.trim())`; L74/L75 → `setAccDescription(trim)`; L76 `section` → `yy.addSection($1.substr(8))`.
- L80–82 `period` → `yy.addTask($1, 0, '')`; L83–85 `event` → `yy.addEvent($1.substr(2))`.
- (probed) A period spelled `timeline` (`timeline\ntimeline : x`) is rejected: the keyword rule wins. `section\n2002 : x` throws `Cannot read properties of undefined (reading 'events')`.
- (probed) Repeated `2002` periods stay two tasks; `2002 :\n2003 : x` gives `2002 ` the events `["2003 ", "x"]`.

## 2. DB — `$V/timelineDb.js`

- Module state L2–8: `currentSection=''`, `currentTaskId=0`, `direction='LR'`, arrays `sections`, `tasks`, `rawTasks`.
- L12–19 `clear()` empties sections/tasks/rawTasks, resets `currentSection`, `direction`, calls `commonDb.clear()`; does **not** reset `currentTaskId`, so ids keep growing across parses (harmless).
- L29–32 `addSection(txt)`: sets `currentSection`, pushes the name (duplicates kept). L34–36 `getSections()` returns the array.
- L52–63 `addTask(period, length, event)`: rawTask `{id, section: currentSection, type: currentSection, task, score: length||0, events: event ? [event] : []}`.
- L65–70 `addEvent(e)`: finds rawTask with `id === currentTaskId-1` and pushes; none → TypeError (event before any period).
- L38–50 `getTasks()`: `compileTasks` (L89–101) reads `rawTask.processed`, which is never set, so it loops 1+100 times; then L47 `tasks.push(...rawTasks)` — every call appends again (probed: lengths 1 then 2). Call once.
- L72–81 `addTaskOrg` unused by the grammar. L103–114 default export; the diagram's `db` is the module namespace (`timeline-definition.ts:3`), not a class.
- accTitle/accDescr go to `commonDb` (`fa796a943:packages/mermaid/src/diagrams/common/commonDb.ts:16–26`, sanitised). The namespace has no `getAccTitle`, so `mermaidAPI.ts:628–630` gets `undefined` and writes no `<title>`/`<desc>`.
- Front-matter `title`: `Diagram.ts:52–53` calls `db.setDiagramTitle?.()`; the namespace has none (dist chunk L612–626), so v12 timeline **drops** a front-matter title.
- `timeline-definition.ts:12–18` picks `timelineRendererVertical` when `getDirection()==='TD'`, else LR. `detector.ts:10` `/^\s*timeline/`.

## 3a. LR renderer — `$V/timelineRenderer.ts`

- L31–34 reads `look`, `theme`, `themeVariables.{useGradient,gradientStart,gradientStop}`; `LEFT_MARGIN = timeline.leftMargin ?? 50` (schema default is 150, so 150 in practice).
- L51 appends an empty `<g>` first. L61 `initGraphics(svg, id)` → marker `${id}-arrowhead`.
- L73 `masterX = 50 + LEFT_MARGIN`; L75–76 `masterY = sectionBeginY = 50`.
- L82–94 `maxSectionHeight = max(virtualHeight(width 150, padding 20) + 20)`.
- L103–136 per task: `maxTaskHeight = max(virtualHeight(150, 20) + 20)`; `maxEventLineLength = max over tasks of Σ eventHeights(150, 20) + 10·(n−1)` (global, all columns).
- L141–185 with sections: for each section **name**, `tasksForSection = tasks.filter(t.section === name)` (L144). Periods before the first section (section `''`) are never drawn; two sections with one name both draw every period of that name.
- L150 section text width `200·max(n,1) − 50` (box adds 2·padding → `200n − 10`); drawn at `(masterX, 50)` L159; L161 tasks at `masterY = 50 + maxSectionHeight + 50`; L181 `masterX += 200·max(n,1)`.
- L156/L165 colour slot = section ordinal (`sectionNumber`); L186–203 no sections → `drawTasks(..., isWithoutSections=true)` at `masterY = 50`.
- L206 bbox before title. L209–217 title: `x = look==='neo' ? box.x·2 + LEFT_MARGIN : box.width/2 − LEFT_MARGIN`, `y=20`, `font-size 4ex`, bold, no anchor (start).
- L219 axis y `depthY = hasSections ? maxSectionHeight + maxTaskHeight + 150 : maxTaskHeight + 100` (50 below the tallest period).
- L221–231 axis `<g class=lineWrapper><line>` x1 `LEFT_MARGIN`, x2 `box.width + 3·LEFT_MARGIN`, stroke-width 4, stroke black, `marker-end url(#${id}-arrowhead)`.
- L234–257 `look==='neo' && useGradient && theme!=='neutral'` → `<linearGradient id=${svgId}-gradient>` 0%→100% x, stops `gradientStart`/`gradientStop`. Only LR does this.
- L260–265 `setupGraphViewbox(undefined, svg, timeline.padding ?? 50, timeline.useMaxWidth ?? false)`; schema default for `useMaxWidth` is true (BaseDiagramConfig).
- `fa796a943:packages/mermaid/src/setupGraphViewbox.js:49–71`: viewBox `bbox.x−p bbox.y−p bbox.w+2p bbox.h+2p`; `useMaxWidth` → `width=100%`, `style=max-width:Wpx`, else width/height attrs.
- drawTasks L270–341: period node `width 150, padding 20, maxHeight maxTaskHeight` (L287–294) in `<g class=taskWrapper>` at `(masterX, masterY)`.
- L310 `if (task.events)` is always true (array), so a dashed connector is drawn even for a period with no events.
- L315/L354 events start at `masterY + 100 + 100` = 200 below the period top (D252 overlap when maxTaskHeight > 150).
- L321–330 connector x `masterX + 95` (190/2), y1 `masterY + maxTaskHeight`, y2 `masterY + maxTaskHeight + 200 + maxEventLineLength`, width 2, dash `5,5`, arrowhead.
- L333 column pitch 200; L334–336 `sectionColor++` only when no sections and not `disableMulticolor` (so with sections the flag does nothing).
- drawEvents L343–380: event node `width 150, padding 20, maxHeight 50` (min height 50), `<g class=eventWrapper>`, pitch `eventHeight + 10` (L375).

## 3b. TD renderer — `$V/timelineRendererVertical.ts`

- L29–39 constants: `NODE_WIDTH 200`, `NODE_PADDING 5`, `NODE_TOTAL_WIDTH 210`, `EVENT_WIDTH 300`, `EVENT_TOTAL_WIDTH 310`, `EVENT_SPACING 10`, `EVENT_VERTICAL_GAP 0`, `SECTION_TASK_GAP 20`, `TASK_AXIS_GAP 20`, `TASK_VERTICAL_GAP 30`, `EVENT_AXIS_GAP 50`.
- L44 `LEFT_MARGIN ?? 50`; L60 `initGraphics(svg)` with no id → marker `undefined-arrowhead`, but L236/L338 reference `url(#arrowhead)`: no arrowheads drawn (D253).
- L69 `masterX = 50 + LEFT_MARGIN`; L70 `masterY = contentTopY = 50`; L73 `leftWidth = 230`; L74 `rightWidth = 360`; L75/L78 `timelineX = masterX + 230` in both branches.
- L80 section text width `max(50, 230 + 360 − 10) = 580` (box 590, spans masterX…masterX+590); L82–94 `maxSectionHeight` (no +20).
- L100–131 `maxTaskHeight = max(virtualHeight(200, 5))`; `maxEventStackHeight = max(Σ eventHeights(300, 5) + 10·(n−1))` over all periods.
- L136–137 `taskSpacing = max(maxTaskHeight, maxEventStackHeight) + 30` — one row height for every period.
- L139–184 sections grouped by name (L142, as LR). Section at `(timelineX − 230, masterY)` L157–158; periods from `masterY + node.height + 20` L160.
- L177–182 section advance `node.height + 20 + taskSpacing·max(n,1) − (n>0 ? 60 : 0)`: the next section starts 30 px above the end of the previous section's last row (overlap when that row is full height).
- drawTasks L248–296: period box right edge 20 px left of the axis (`taskX = timelineX − 20 − node.width`, L278); row pitch `taskSpacing`; slot increments as LR (L292–294).
- L285 events only when `events.length > 0`; L287 `eventsX = timelineX + 50`.
- drawEvents L298–344: event node `maxHeight 0`; per event a dashed connector `axisX → eventsX` at `y = currentY + eventHeight/2`, width 2, `5,5` (L328–339); pitch `eventHeight + 10`.
- L201–220 bbox, title same as LR classic formula (`box.width/2 − LEFT_MARGIN`, y 20) with no `look` branch; bbox re-read after the title.
- L222–224 `arrowTopOffset = fontSize·2`, `arrowBottomPadding = fontSize·0.5 + 20` (`parseFontSize(conf.fontSize)`, default 16).
- L226–237 axis x `timelineX`, y1 `50 − 2·fontSize`, y2 `box.y + box.height + 0.5·fontSize + 20`, width 4, then `.lower()` (first child).
- L240–245 viewBox as LR. No gradient defs in TD, so the neo gradient CSS (`url(#svgId-gradient)`) points at nothing.

## 4. `$V/svgDraw.js`

- Only `initGraphics`, `drawNode`, `getVirtualNodeHeight` are used; `drawRect/Face/Circle/Text/Label/Section/Task` (L4–316) and `_drawTextCandidateFunc` (L318–434) are journey copies, never called.
- L436–450 `initGraphics`: resets `nodeCount`; `<defs><marker id=${id}-arrowhead refX=5 refY=2 markerWidth=6 markerHeight=4 orient=auto><path d="M 0,0 V 4 L6,2 Z">`.
- L456–496 `wrap(text, width)`: splits `text()` on `/(\s+|<br>)/` (capture keeps separators as words), greedy `getComputedTextLength() > width`, line height `1.1em`, tspans `x=0`.
- Only lowercase `<br>` breaks; `<br/>`, `<BR>` stay as text. An over-long first word leaves an empty first tspan.
- L498–568 `drawNode(elem, node, fullSection, conf, diagramId, isEvent)`: L500 `isReduxTheme = theme.includes('redux')`; L501 `maxSections = THEME_COLOR_LIMIT ?? 12`.
- L502 `section = (fullSection % maxSections) − 1`, so slot 0 gets class `section--1`; L505–508 class `timeline-node section-<slot−1>`.
- L514–521 `<text dy=1em alignment-baseline=middle dominant-baseline=middle text-anchor=middle>` then `wrap`. Labels are plain text (`.text()`).
- L522–526 height `bbox.height + fontSize·1.1·0.5 + padding`, then `max(height, maxHeight)`; width `width + 2·padding`. `fontSize` is `conf.fontSize` with `px` stripped.
- L528–534 label transform `(w/2, padding/2)`; redux `(w/2, isEvent ? padding/2 + 3 : padding)`.
- L539–565 `look==='neo'` → `data-look="neo"`; plus redux: one `<filter id=${svgId}-drop-shadow height=130% width=130%><feDropShadow dx=4 dy=4 stdDeviation=0>`, opacity/colour `dark ? 0.2/#FFFFFF : 0.06/#000000` (`theme.includes('dark')`).
- L570–584 `getVirtualNodeHeight`: same measure, no `maxHeight` floor, element removed.
- L586–610 `defaultBkg`: `r = redux ? 0 : 5` (L588). Classic path: top corners `q` radius 5, square bottom; redux: plain rectangle path.
- Path `id=${diagramId}-node-${n}` (TD: `undefined-node-n`), class `node-bkg node-undefined` (`node.type` unset).
- L601–609 non-redux only: `<line class=node-line-<slot−1> x1=0 y1=h x2=w y2=h>` (the 3 px rule; width from CSS).
- Text measurement is DOM `getBBox`/`getComputedTextLength` throughout.

## 5. `$V/styles.js`

- L148–152 `getStyles` reads `getConfig().theme` → `isReduxTheme` (`includes('redux')`), `isNeutralTheme`. Loops run `colorSlotCount(THEME_COLOR_LIMIT)` (gate `fa796a943:…/common/colorThemeGate.ts:86`, default 12, max 64).
- Classic `genSections` L90–146, per i, selector index `i−1`:
  - L110–114 `.section-N rect, path, circle` fill `cScale<i>` (only `path` matches).
  - L115–117 `.section-N text` fill `cScaleLabel<i>`.
  - L128–131 `.section-N line` stroke `cScaleInv<i>`, width 3 (the rule under the box).
  - L133–135 `.lineWrapper line` stroke `cScaleLabel<i>`, repeated per i, so `cScaleLabel11` wins; widths stay the attrs (4 axis, 2 connectors).
  - L98–105 computes `lineColor<i>` from `cScaleInv` and mutates `options`; never used.
- Redux `genReduxSections` L5–88: `isDarkTheme = theme.includes('dark')`; `isColorTheme(theme, borderColorArray)` (colour themes by name, gate L17/L37).
  - L31–44 `.section-N rect, path, circle` fill `isDark && isColorTheme ? mainBkg : (borderColorArray[i % len] ?? mainBkg)`, stroke `slot ?? nodeBorder`, `stroke-width: strokeWidth`, `filter: url(#svgId-drop-shadow)`.
  - The filter is set even when `look` is not neo, where no filter element exists.
  - L47–50 `.section-N text` fill `nodeBorder`, `font-weight: fontWeight`. L65–68 `.section-N line` (nothing drawn in redux). L70–73 `.lineWrapper line` stroke `nodeBorder`, width `strokeWidth`.
- L157–174 gradient: `useGradient && svgId && THEME_COLOR_LIMIT && !neutral` → `.section-N[data-look="neo"] path` fill `mainBkg`, stroke `url(#svgId-gradient)` width 2; `… line` same stroke, width 2.
- L197–199 `.eventWrapper { filter: brightness(120%) }`.
- Match nothing (mindmap/journey copies): `.node-icon-N` (L52/L118), `.section-edge-N` (L57/L122), `.edge-depth-N` (L61/L125), `.edge` (L177, L194), `.section-root …` (L182–187, `git0`, `gitBranchLabel0`), `.icon-container` (L188), `.disabled …` (L75–83/L137–142, `tertiaryColor`, `clusterBorder`), and every `rect`/`circle` arm.

## 6. v12 themes — `cScale*`, `cScaleInv*`, `cScaleLabel*`, `THEME_COLOR_LIMIT`

`THEME_COLOR_LIMIT = 12` in every theme constructor. `darkMode` is never set by a theme (only by a user override). `darken`/`lighten` are khroma HSL-lightness steps; `adjust({h})` rotates hue.

Only `theme-default.js` calls `updateColors()` in its constructor (L144) as well as in `calculate` (L491/L503). Every other theme runs it once.

- `$TH/theme-base.js`: L156–167 `cScale0..2 = primary/secondary/tertiary`, 3–11 `adjust(primary, h: 30,60,90,120,150, {210,l:150}, 270,300,330)`.
  - L168–176 every slot `darken(…, 75)` if `darkMode` else `darken(…, 25)`. L179–181 `cScaleInv = invert(cScale)`. L192–196 `cScaleLabel = scaleLabelColor || labelTextColor` (#333).
- `$TH/theme-default.js`: L150–161 same hues (cScale8 has no `l`). L164–168 `darken(…, 10)` on every call, so **20** in total.
  - Overriding `primaryColor` does not move cScale3..11: the constructor pass already filled them (probed).
  - L170–172 `cScaleInv = adjust(cScale, {h:180})`, set on the first pass (from the 10-darkened colour), so it ignores later `cScale` overrides.
  - L180–190 `cScaleLabel0 = cScaleLabel3 = invert(labelTextColor)` (#ffffff), rest `labelTextColor` (black). Guarded by `labelTextColor !== 'calculated'`, so this happens only on the second pass.
- `$TH/theme-dark.js`: L191–202 fixed hex for cScale1–12 (`#0b0000 … #010029`), then L206 `cScale0 = primaryColor` (#1f2020); L207–217 hue lines are dead for 1–11. No darken.
  - L220–222 `invert`. L236–240 `scaleLabelColor || (darkMode ? 'black' : labelTextColor)` → `lightgrey`.
- `$TH/theme-forest.js`: L126–137 hues from primary/secondary/tertiary; L140–144 `darken(…, 10)` once; L147–149 `adjust h:180`; L152–159 label `labelTextColor` (black).
- `$TH/theme-neutral.js`: L152–163 fixed greys `#555 #F4F4F4 #555 #BBB #777 #999 #DDD #FFF #DDD #BBB #999 #777`. L166–168 `invert`.
  - L179–185 `cScaleLabel0 = cScaleLabel2 = cScale1` (#F4F4F4), rest `#333`.
- `$TH/theme-neo.js`: L176–196 like base, but from **local** consts L120–122 (`primaryColor '#ECECFE'`, `secondaryColor '#E9E9F1'`, tertiary `adjust(h180,l5)`), not `this.primaryColor`; darken 25. L199–201 `invert`. L214–216 label (#333).
- `$TH/theme-neo-dark.js`: L189–207 like base from `this.primaryColor` (#1f2020), darken 25 (≈ black); L212–214 invert (≈ white); L227–229 label (#e0dfdf).
- `$TH/theme-redux.js`: L186–196 every `cScale = mainBkg`, then darken 25 (75% grey); L200–202 invert; L215–217 label = nodeBorder colour #28253D. Redux selectors never draw from `cScale*`.
- `$TH/theme-redux-dark.js`: L203–221 as neo-dark; L226–228 invert; L241–243 label.
- `$TH/theme-redux-color.js`: L226–237 fixed Tailwind-300 (darken commented out L239–247); L270–272 invert; L285–287 label = `scaleLabelColor || labelTextColor`.
- `$TH/theme-redux-dark-color.js`: L230–241 same Tailwind-300; L273–275 invert; L288–290 `cScaleLabel = darken(cScale, 75)`, unconditional.
- Overrides: `calculate()` re-copies user keys after `updateColors` (e.g. `theme-default.js:500–503`), so a user `cScaleN` is used verbatim. `cScaleInvN` derives from the darkened override (base, forest), the fixed value (dark, neutral) or neither (default).
- Values (12.2.0, computed): default `cScale0 = hsl(240,100%,76.27%)`, `cScaleInv0 = hsl(60,100%,86.27%)`; forest `cScale0 = hsl(78.16,58.46%,64.51%)`; base `cScale1` has hue −79.41. Re-run with `getThemeVariables` from `dist/chunks/mermaid.core/chunk-DSNLSHJZ.mjs` (`themes_default`).

## 7. Current v13 tree

- `packages/core/src/theme/vocabulary.ts:138` `PALETTE_VARIABLES = ['borderColorArray','bkgColorArray','cScale']`; L143 `PALETTE_LIMIT = 12`; L133–137 the doc comment.
  - Rows `mainBkg` L169, `nodeBorder` L170, `strokeWidth` L207, `radius` L209, `fontWeight` L210, `dropShadow` L265, `useGradient` L268, `gradientStart`/`Stop` L269–270.
- `packages/core/src/theme/theme.ts:464` `RE_C_SCALE = /^cScale(\d{1,2})$/` — the only numbered override; L477–512 `resolvePalettes`.
  - L510: an override is kept only if `i < out.cScale.length`, so in themes without a `cScale` palette (all classic) `cScale0` is silently ignored today.
  - L136–139 / L691 `theme.palette(name)`.
- Palettes are literal lists (`spec.ts:26 palettes?: Partial<Record<PaletteVariable, string[]>>`): only `specs/redux-color.ts:16–20` and `specs/redux-dark-color.ts:18–22` define `cScale` (`specs/palettes.ts:38` `TAILWIND_300`).
  - Users: `theme.palette('borderColorArray'|'bkgColorArray')` in flowchart, class, er, sequence renderers. No diagram reads `cScale` yet.
- DSL `packages/core/src/theme/dsl.ts:27–35` functions: mix, lighten, darken, lightenHsl, darkenHsl, alpha, contrast, invert — **no hue rotation**, so v12's `adjust({h})` has no rule form. Palettes can't derive from `primaryColor` today.
- `packages/core/schema/config.schema.yaml:3001–3150` `TimelineDiagramConfig`, all `x-mermaid: { status: pending }`.
  - Keys: diagramMarginX 50 (3021), diagramMarginY 10 (3025), leftMargin 150 (3029), width 150 (3035), height 50 (3041), padding no default (3047).
  - boxMargin 10, boxTextMargin 5, noteMargin 10, messageMargin 35, messageAlign center, bottomMarginAdj 1, rightAngles false, taskFontSize 14, taskFontFamily `"Open Sans", sans-serif`, taskMargin 50, activationWidth 10, textPlacement fo.
  - actorColours, sectionFills, sectionColours arrays; disableMulticolor false (3145). `useMaxWidth` comes from `BaseDiagramConfig` (L977, default true).
- Registry: `packages/mermaid/src/generated/registry.gen.ts:55` and `detectors.gen.ts:21` `{ type: 'timeline', pattern: /^\s*timeline/ }` (no id/load), after `flowchart-v2`, before `gitGraph`.
- `packages/conformance/src/registry.ts:12–41` `PARITY_SUITES: ParitySuite[]` (`corpus.ts:10–16`: `{ adapter: DiagramAdapter, corpusDirs: string[], corpusFiles?: string[] }`).
  - Adapter shape `types.ts:8–25`: `id, v12Types, detect, parse, normaliseV13, v12Config?, normaliseV12`.
- Shared jison oracle (#285): **not on any branch**. `ls packages/conformance/src` has only per-diagram copies (`flowchart/`, `sequence/`, `state/jison-lexer.ts`).
  - Work in progress is uncommitted in worktree `285-shared-jison-oracle-de7b69`: `packages/conformance/src/jison/{oracle,harvest,types}.ts`, `cli/harvest.ts`; timeline descriptor `jison/types.ts:131–137` (probe `timeline\n  title x`, literals harvest).

## 8. Oracle runtime

- `packages/conformance/src/oracle.ts:58–94`: resolves `mermaid-v12` (npm:mermaid@^12.2.0, `packages/conformance/package.json:35`), patches its DOMPurify, imports, then `mermaid.parse('flowchart LR\n A')` to register diagrams.
  - `parse()` runs `mermaidAPI.getDiagramFromText(text)` → `{type:'timeline', db}`. `db` is the timelineDb namespace (dist L612–626, L1655–1660) with `getTasks/getSections/getDirection/getCommonDb`.
- Lexer path as sequence does it (`sequence/jison-lexer.ts:56–66`): `(await getDiagramFromText('timeline\n2002 : x')).parser.parser.lexer`, wrap `setInput` to capture text.
  - Difference: sequence makes a fresh `yy` via `db.constructor` (L59). Timeline's db is a namespace, so pass the namespace itself (call `clear()`) as `yy`.
- Model parity: call `getTasks()` exactly once per parse; the title is in `db.getCommonDb().getDiagramTitle()`, acc fields in `getAccTitle()/getAccDescription()` of the same commonDb.

## 9. Corpus

- `e2e/diagrams/timeline/**/*.mmd`: 30 (pr-check 10, nightly-check 20; `visual-check/` has no .mmd).
- TD: `nightly-check/13-…vertical…no-specific-sections.mmd`, `pr-check/14-…vertical…with-sections.mmd`. None use `timeline LR`.
- One diagram across theme × look: the 16 `nightly-check/space-exploration-*-theme-*-look.mmd` share an identical body.
- Overrides: `pr-check/5-…directive-overridden-colors.mmd` (cScale0–2 on default); `pr-check/4-…disablemulticolor-true.mmd` (base, no sections).
- `timeline.spec.js`: 11 `timeline.parse(str)` calls (L17, 25, 33, 41, 50, 65, 84, 108, 133, 157, 175); L151–186 pin trailing spaces in events and `#`/`;` as text in title/section/event.
- Docs `fa796a943:packages/mermaid/src/docs/syntax/timeline.md`: direction L126–144, disableMulticolor L176/L190, cScale/cScaleLabel overrides L201–224, `<br>` L95.

## 10. The reference implementation — `$REF/src/diagrams/timeline/` (db.ts, index.ts, lexer.ts, parser.ts, render.ts)

- `lexer.ts:42–134` hand lexer emitting jison names (`TOKEN_NAMES` L23–40); `timeline`/LR/TD word-bounded (L67–79, matches jison's `\b`).
  - Divergence: bare `title` is skipped (L80–87).
- `db.ts:59–66` periods carry `section` name and `sectionIndex = sections.length − 1`; `addEvent` L68–73 throws a PeleError instead of TypeError.
- `render.ts:51–55` groups by `sectionIndex`, with leading periods as their own group first.
  - L82–86 colour: section ordinal; no sections → period index, or 0 under disableMulticolor; **leading periods with sections present get `var(--_m)` (neutral main fill), not slot 0**.
- `render.ts:14–24` own geometry (text 152–216, TD events 264, gaps 20/8), events at 0.875·fontSize, `turnToFit` L39 (out of scope), title centred L242, arrow markers L178/L233.

## 11. Surprises (vs spec #291)

1. T4a "hue steps and `darken(…, 10)`" holds only for forest. Default darkens twice (−20 lightness) and ignores `primaryColor` overrides for 3–11. Base/neo/neo-dark/redux-dark darken 25. Dark and neutral are fixed hex lists. neo uses a local `#ECECFE`. `cScale8` is `{h:210, l:150}` in base/neo/neo-dark/redux-dark.
2. `cScaleInv` is `invert` in most themes but `adjust(h:180)` in default and forest. `cScaleLabel` has special slots: default 0/3 = #ffffff, neutral 0/2 = #F4F4F4. redux-dark-color derives labels with `darken(cScale, 75)`.
3. v13 palettes are literal lists, and the DSL has no hue rotation. Classic `cScale*` must be precomputed literals (they won't follow a user `primaryColor`, unlike base/forest in v12) unless T4a adds a hue function. `cScaleN` overrides are dropped today when the theme has no `cScale` list (`theme.ts:510`).
4. v12 class names are `section-<slot−1>`: the first section/period is `section--1` (`svgDraw.js:502`). Spec story 14's `section-<n>` should say which numbering v13 keeps.
5. v12 timeline drops a front-matter `title` (no `setDiagramTitle` on the db namespace). D218/story 8 drawing it is a model-parity divergence to list.
6. D251 says leading periods go "in slot 0, as the reference implementation does"; the reference implementation actually paints them neutral (`var(--_m)`), not slot 0.
7. TD sections overlap: the advance subtracts `2·TASK_VERTICAL_GAP`, so the next section starts 30 px above the last row's end. The T3 "no overlaps" invariant departs from v12 here.
8. TD draws no gradient defs, so under `theme: neo` the gradient outline/rule CSS points at a missing id in TD. LR also skips the gradient for `neutral`.
9. LR draws a dashed connector for periods with **no** events (`if (task.events)` on an array); TD draws none. `disableMulticolor` has no effect when sections exist.
10. Redux events' label offset is `padding/2 + 3`, not `padding + 3`. The redux drop-shadow filter is created only under `look: neo`, but redux CSS always sets `filter: url(#…-drop-shadow)`.
11. Renderer fallbacks differ from schema defaults: `leftMargin ?? 50` vs schema 150; `useMaxWidth ?? false` vs schema true. The effective v12 values are 150 and true.
12. Lexer: jison's implicit `\b` makes `timeline` a keyword anywhere at token start, so a period named `timeline` is rejected (probed). `\s+` swallows newlines after spaces.
13. #285 has no committed code yet (uncommitted WIP in its worktree), so T1 is still blocked. Timeline's DB is a namespace, so the sequence-style `db.constructor` trick for a fresh `yy` does not apply.
