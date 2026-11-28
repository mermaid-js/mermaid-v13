# 01 — v12 gantt pointer notes (spec #293)

`V=fa796a943:packages/mermaid/src/diagrams/gantt`. Read with `git show $V/<file>`. Files: `ganttDb.js`, `ganttDb.spec.ts`, `ganttDetector.ts`, `ganttDiagram.ts`, `ganttRenderer.js`, `parser/gantt.jison`, `parser/gantt.spec.js`, `styles.js`.
The oracle (12.2.0 dist) matches the source: `<main checkout>/node_modules/.pnpm/mermaid@12.2.0/node_modules/mermaid/dist/chunks/mermaid.core/ganttDiagram-R7GPNTJY.mjs` (L783 compiled `rules`, L784 `conditions`, L93 `yy.TopAxis()`). The worktree has no `node_modules`.

## 1. Grammar — `$V/parser/gantt.jison`

- L8 `case-insensitive`; L10–16 exclusive states `click`, `href`, `callbackname`, `callbackargs`, `acc_title`, `acc_descr`, `acc_descr_multiline`. INITIAL is inclusive (dist L784).
- First match wins (no `flex`). jison appends `\b` to a rule ending in a word character: `gantt\b`, `inclusiveEndDates\b`, `topAxis\b`, `weekday\s+monday\b` …, and `\d\d\d\d-\d\d-\d\d\b` (dist L783).
- Lexer rules in order:
  - L18 `%%{` → `begin('open_directive')`. The state is never declared, so this crashes if reached. v12 strips directives first.
  - L20 `accTitle\s*:\s*` → `acc_title`; L21 `<acc_title>(?!\n|;|#)*[^\n]*` pop → `acc_title_value`. It compiles to `(?!\n||)*`, so in effect `[^\n]*`.
  - L22/L23 the same pair for `accDescr:`. L24 `accDescr\s*{\s*` begins the multiline state (no token); L25 `<…>}` pops; L26 `<…>[^}]*` → `acc_descr_multiline_value`.
  - L28 `%%(?!\{)*[^\n]*` skip. L29 `[^\}]\%\%*[^\n]*` skip: any char except `}` (newline included) followed by **one** `%` drops the rest of the line (`5% x :1d`, `a%b :1d` vanish). L30 `%%*[^\n]*[\n]*` skip.
  - L32 `[\n]+` → `NL`; L33 `\s+` skip; L34 `%[^\n]*` skip (unreachable after L30).
  - L42 `href[\s]+["]` begin `href` (INITIAL); L43 `<href>"` pop; L44 `<href>[^"]*` → `href`.
  - L54 `call[\s]+` begin `callbackname` (INITIAL: a task text starting `call ` enters it); L55 `<cbn>\([\s]*\)` pop; L56 `<cbn>\(` → `callbackargs`; L57 `<cbn>[^(]*` → `callbackname`; L58 `<cba>\)` pop; L59 `<cba>[^)]*` → `callbackargs`.
  - L67 `click[\s]+` begin `click` (a task text `click me :1d` enters it too); L68 `<click>[\s\n]` pop; L69 `<click>[^\s\n]*` → `click` (ids as one token, `a,b`).
  - L71 `gantt`; L72 `dateFormat\s[^#\n;]+`; L73 `inclusiveEndDates`; L74 `topAxis`; L75 `axisFormat\s[^#\n;]+`; L76 `tickInterval\s…`; L77 `includes\s…`; L78 `excludes\s…`; L79 `todayMarker\s[^\n;]+` (allows `#`).
  - L80–86 `weekday\s+<day>` → `weekday_<day>`; L87–88 `weekend\s+friday|saturday`.
  - L89 `\d\d\d\d-\d\d-\d\d` → `date`: no grammar rule takes it, so a task text starting with an ISO date is a syntax error.
  - L90 `title\s[^\n]+` (`\s` may be `\n`: a bare `title` eats the next line); L91 `accDescription\s[^#\n;]+` (lexed, unused); L92 `section\s[^\n]+` (same `\s` quirk).
  - L93 `[^:\n]+` → `taskTxt` (keeps trailing spaces; leading `#`/`;` are text); L94 `:[^#\n;]+` → `taskData`; L95 `:` → `:`; L96 `<<EOF>>`; L97 `.` → `INVALID`.
  - Keyword prefixes beat `taskTxt` (`gantt plan :1d`, `topAxis x :1d`, `weekend friday party :1d`, `title`/`section` + space). Pitfall-3 cases for T1.
- Parse rules: L107–109 `start: gantt document EOF`. L111–114 `document` left-recursive. L116–121 `line: SPACE statement | statement | NL | EOF`. `SPACE` is never lexed.
- L123–136 `weekday`/`weekend` → `yy.setWeekday(..)` / `yy.setWeekend(..)`.
- L138–156 statements. Values are `substr(n)` with no trim: dateFormat 11, inclusiveEndDates, topAxis (`yy.TopAxis()`, **undefined in the DB** → TypeError, D273), axisFormat 11, tickInterval 13, excludes/includes 9, todayMarker 12, title 6.
  - Accessibility values are trimmed. `section` → `addSection(substr(8))`. `taskTxt taskData` → `addTask($1,$2)`. `accDescription` is never taken.
- L162–173 `clickStatement`: 7 alternatives: `click cbn [args] [href]`, `click href cbn [args]`, `click href`. L175–186 `clickStatementDebug` is unused.

## 2. DB — `$V/ganttDb.js` (module state, default export L835–878)

- L24 `WEEKEND_START_DAY {friday:5, saturday:6}`; L25–45 state. `weekday='sunday'` (L41) and `weekend='saturday'`. L36 tags `active, done, crit, milestone, vert`.
- L47–71 `clear()` resets everything **except `taskDb`** (L595 `const taskDb = {}`, module-level, only ever written L629). `findTaskById` (L632–635) reads `rawTasks[taskDb[id]]`, so an id from an earlier diagram resolves to whatever task now sits at that index.
- L133–154 `mergeTokens`: lowercases, splits `/[\s,]+/`, dedupes, appends across lines (#6270). It is used by `setIncludes`/`setExcludes`.
- L169–181 `getTasks`: `compileTasks()` + up to 10 more while not all are processed (11 passes); then `tasks = rawTasks`.
- L183–201 `isInvalidDate(d, fmt, excl, incl)`: includes win (formatted or `YYYY-MM-DD`); `weekends` → isoWeekday equals `WEEKEND_START_DAY[weekend]` or +1; weekday names via `format('dddd').toLowerCase()`; then dates.
- L227–254 `checkTaskDates`: returns when there are no excludes **or** `manualEndTime`. Otherwise start + 1d, then `fixTaskDates`; it sets `endTime` and `renderEndTime`.
- L268–288 `fixTaskDates`: walks days start→end; each excluded day pushes the end +1d; `renderEndTime` is the end before the last excluded run. Guard: throws when the end passes original + 10,000 d (L271, L279).
- L305–375 `getStartDate(prev, fmt, str)`:
  - L315 `x`/`X` + `/^\d+$/` → `new Date(Number(str))` (ms for both).
  - L319 `/^after\s+(?<ids>[\d\w- ]+)/`: latest `endTime`; unknown ids → `log.warn` (L299–303, #4121); none found → `new Date()` at local midnight (L345–347).
  - L351 `dayjs(str, fmt.trim(), true)`; else L359 `new Date(str)`, throwing `Invalid date:` on NaN or |year| > 10000 (L360–371).
- L399–407 `parseDuration`: `/^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/` → `[float, unit]`, else `[NaN,'ms']`. `m` (minutes) is accepted, though the doc comment omits it.
- L409–466 `getEndDate(prev, fmt, str, inclusive)`:
  - L413 `until` takes the earliest `startTime`; unknown ids → today midnight.
  - Strict date, +1d if inclusive (L445–451).
  - Else a duration via `dayjs.add`; bad → warn (L456–458), zero duration; an invalid result keeps `prev`.
- L468–475 `parseId`: `task<n>` with a counter (reset by `clear`). L487–534 `compileData` and L637–656 `addTaskOrg` are dead (grammar uses `addTask`).
- L536–590 `parseData`: strips a leading `:`, splits `,`, then `getTaskTags` (L885–899). Tags are case-sensitive `^\s*tag\s*$`, any order, only leading.
  - Then trim. 1 field → `prevTaskEnd`; 2 → start, end; 3 → id, start, end; ≥4 → no `startTime`, so `compileTask` reads `.type` of undefined (TypeError in `getTasks`).
  - Only tags (`:done`) → `data[0].match` on undefined: TypeError at **parse** time.
- L596–630 `addTask`: rawTask `{section, type: section, processed, manualEndTime, renderEndTime, raw, task, classes}`. `vert` → `order=-1`, else `lastOrder++`; `taskDb[id] = index` (last wins).
- L658–704 `compileTasks`:
  - `prevTaskEnd` → `findTaskById(prevTaskId).endTime` (a first task with one field: TypeError).
  - Then `getEndDate`; `manualEndTime = dayjs(raw end, 'YYYY-MM-DD', true).isValid()` (L685–689, fixed format), then `checkTaskDates`.
- L712–727 `setLink`: `sanitizeUrl` unless `securityLevel==='loose'`; for known ids → `pushFun(window.open(url,'_self'))`, `links.set`; `setClass(ids,'clickable')` (L735–742, unknown ids silent).
- L744–778 `setClickFun`: **only under `loose`**. It splits args on `,` outside double quotes, strips surrounding quotes, defaults to `[id]`, and calls `utils.runFunc`.
- L787–808 `pushFun` binds by `[id="${diagramId}-${id}"]` and `…-text`. L817–822 `setClickEvent`; L829 `bindFunctions`.
- Frontmatter: `fa796a943:packages/mermaid/src/preprocess.ts:19–30` moves `displayMode` to `config.gantt.displayMode`. `db.setDisplayMode` is called only by specs. `Diagram.ts:52–53` calls `db.setDiagramTitle` (gantt has it, so a front-matter title is drawn).
- `ganttDiagram.ts:8–13` `{parser, db, renderer, styles}`; `ganttDetector.ts:10` `/^\s*gantt/` (case-sensitive, no `\b`).

## 3. Renderer — `$V/ganttRenderer.js` (d3 + dayjs duration)

- L42–50 weekday → `timeMonday…timeSunday`. L63–81 `getMaxIntersections(tasks, offset)`: sort by start then order; greedy first free lane (`start >= laneEnd`); mutates `task.order = lane + offset`; returns the max lane.
- L84 `MAX_TICK_COUNT = 10000`. L102–111 `w = parentElement.offsetWidth`; `1200` only if `undefined` (never in a browser; a hidden parent gives 0); `conf.useWidth` overrides.
- L116–126 vert tasks are filtered out; `categories` = unique `type` of the rest, in task order.
- L129–152 `h = 2·topPadding`. Compact if `db.getDisplayMode()` or `conf.displayMode === 'compact'`: per **section name** (object keys) `getMaxIntersections + 1` rows. Otherwise one row per task. The title does not add height.
- L155 `viewBox 0 0 w h` (fixed, not a bbox). L159–168 `scaleTime` domain = min start / max end over **all** tasks (vert included), `rangeRound([0, w − leftPadding − rightPadding])`.
- L188 sort by start; L190 `makeGantt`; L192 `configureSvgSize(svg, h, w, useMaxWidth)`. `setupGraphViewbox.js:23–46`: `width=100%` + `max-width:wpx`, else width/height.
- L194–199 title `<text x=w/2 y=titleTopMargin class=titleText>`, always appended, even when empty.
- L212–215 HCL colour scale `#00B9FA→#F95002`, never used. L217–230 draw order: exclude ranges, grid, rects + labels, section titles (`vertLabels`, misnamed), today.
- drawRects L242–536:
  - L244 vert last. L253–277 bands: one `<rect>` per unique `order`, `x 0`, `y order·gap + topPad − 2`, `width w − rightPadding/2`, `height gap`.
  - Band class `section section<catIdx % numberSectionStyles>`, else `section section0`.
- Task `<rect>` L286–392:
  - `id=${id}-${task.id}`, `rx=ry=3`; `x = scale(start) + leftPad`; `width = scale(renderEnd||end) − scale(start)`; `y = order·gap + topPad`, `height barHeight`.
  - Milestone: `x += 0.5·(endX−startX) − 0.5·barHeight`, width `barHeight`.
  - Vert: `y gridLineStartPadding`, width `0.08·barHeight`, height `nRows·(barHeight+barGap) + 2·barHeight`.
  - `transform-origin` = bar centre (for CSS rotate).
  - Class `task` + ` active|done|crit|activeCrit|doneCrit` (else ` task`), prefixed ` milestone `/` vert `, then `secNum`, then `classes` (`clickable`). Vert usually reads `task vert  task0`.
- Label `<text>` L395–510:
  - `id=${id}-${task.id}-text`, `.text(task)` (no `<br>` handling), `font-size conf.fontSize`.
  - y `order·gap + barHeight/2 + (fontSize/2 − 2) + topPad`; vert y `gridLineStartPadding + nRows·(barHeight+barGap) + 60`, x `scale(start)+leftPad`.
  - Fits (`getBBox().width ≤ endX−startX`) → centre, `taskText taskText<N>`. Else `endX + textW + 1.5·leftPadding > w` → `startX+leftPad−5`, `taskTextOutsideLeft`; else `endX+leftPad+5`, `taskTextOutsideRight`. Plus `taskTextOutside<N>`.
  - x uses `renderEndTime||endTime`; the class test uses `endTime` (L444), so the two can disagree.
  - `width-<textW>` class (not on OutsideLeft); type classes `activeText|activeCritText|doneText|doneCritText|critText<N>`, `milestoneText`, `vertText`.
- L514–535 `<a xlink:href target=_top>` around rect + text **only under `securityLevel: sandbox`**. Otherwise links are JS `window.open(_self)`.
- drawExcludeDays L547–620:
  - Skips when there are no excludes and no includes, and when the span is over 5 years (L567–572, warn).
  - Day walk min→max; ranges of `isInvalidDate` days. **A range still open at the end is never pushed** (no flush after L595).
  - Rect `id=${id}-exclude-<date>`, `x scale(startOf day)+leftPad`, `y gridLineStartPadding`, `width scale(endOf day) − scale(startOf day)`, `height h − topPad − gridLineStartPadding`, class `exclude-range`.
- L631–641 `getEstimatedTickCount` (dayjs.duration ms; month = 365/12 d).
- makeGrid L649–797:
  - axisFormat = db value, else `'%d'` if dateFormat is exactly `D` (untrimmed compare), else `conf.axisFormat ?? '%Y-%m-%d'`.
  - L661–663 `axisBottom`, `tickSize(−h + topPad + gridLineStartPadding)`. L665 `/^([1-9]\d*)(millisecond|…|month)$/` on `db.getTickInterval() || conf.tickInterval` (no `year`).
  - L679 `db.getWeekday() || conf.weekday` (db is never empty, D279). Over 10,000 ticks → warn, d3 auto ticks.
  - L722–732 `<g class=grid transform=translate(leftPad, h−50)>`; tick text `text-anchor middle`, `fill #000`, `stroke none`, `font-size 10`, `dy 1em`.
  - L734–796 top axis if `db.topAxisEnabled() || conf.topAxis`: `axisTop` at `translate(leftPad, topPad)`, no `dy`. The over-limit case is silent here.
- Section titles L803–852: `<text dy=−(rows−1)/2 em>` split on `common.lineBreakRegex` (`/<\/?br\s*\/?>/gi`, `common.ts:8`); tspans `x=10`, `alignment-baseline central`, `dy 1em` after the first.
  - `x 10`; y = `rows·gap/2 + prevRows·gap + topPad`; `font-size sectionFontSize`; class `sectionTitle sectionTitle<i % n>`.
- drawToday L860–880: `off` → none; `<g class=today><line class=today>` at `new Date()`, `y1 titleTopMargin`, `y2 h − titleTopMargin`; `style = marker.replace(/,/g,';')`. It is drawn even outside the domain.

## 4. Styles — `$V/styles.js`

- Theme variables read: `fontFamily` (L4, 48, 61, 89, 95, 286), `excludeBkgColor` L8, `sectionBkgColor` L17, `sectionBkgColor2` L21, `altSectionBkgColor` L26, `titleColor` L31–43 + L285 (`|| textColor`), `gridColor` L55, `textColor` L62, `todayLineColor` L74.
  - Also `taskTextDarkColor` L93/99/172/191/250/279, `taskTextClickableColor` L112/118/124, `taskTextColor` L135, `taskBkgColor`/`taskBorderColor` L142–143, `taskTextOutsideColor` L149/154/204/262, `activeTaskBkgColor` L164/224, `activeTaskBorderColor` L165, `doneTaskBorderColor`/`doneTaskBkgColor` L182–183/233, `critBorderColor` L214/223/232, `critBkgColor` L215, `vertLineColor` L266/272.
  - That makes 22, the same list as the spec.
- Only indices 0–3 have rules: `numberSectionStyles > 4` leaves `section4+`/`task4+` unstyled.
- CSS literals (pitfall 13 candidates): `.section opacity 0.2` L13/27; `.grid .tick opacity 0.8` L56; `.grid path stroke-width 0` L66; `.today stroke-width 2px` L75; `.task stroke-width 2` L84.
  - Also `done/crit/activeCrit/doneCrit stroke-width 2` L184/216/225/234; `.milestone transform rotate(45deg) scale(0.8,0.8)` L240; `.milestoneText italic` L244; `.vertText 15px` L270; `.titleText 18px` L284.
- No `look`/`[data-look]` rule, no gradient, no filter (D278). Themes: `theme-redux-color.js:265–266` `sectionBkgColor = cScale0`, `sectionBkgColor2 = cScale1` (comment L251–259).
  - `theme-neo.js:123–126` sets `sectionBkgColor` twice (L125 dead).

## 5. Specs and config

- `parser/gantt.spec.js` (289 lines): 17 `it`/`it.each` blocks (14 `it`, `it.each` ×5 tags L172, ×7 weekdays L271, ×2 `__proto__`/`constructor` L279), so 28 runs. It uses `parser.yy = ganttDb` + `clear()` (L12–15).
- `ganttDb.spec.ts` (620 lines): 28 blocks, `it.each` tables L13 (1), L20 (5), L47 (10), L65 (8), L87 (5), L533 (2).
  - L485 `describe.skipIf(TZ != 'America/Los_Angeles')` 25-hour day. Unknown-ref rows compare with `new Date().setHours(0,0,0,0)` (L90): they need `now`.
  - L542 `Invalid date:202304`; L558 year 202 via `new Date` fallback.
- Harvest: `packages/conformance/corpus/gantt-v12-specs.json` exists (41 entries).
- Config: `fa796a943:packages/mermaid/src/schemas/config.schema.yaml:2089–2210` `GanttDiagramConfig`:
  - titleTopMargin 25, barHeight 20, barGap 4, topPadding 50, rightPadding 75, leftPadding 75, gridLineStartPadding 35, fontSize 11, sectionFontSize 11 (tsType `string|number`), numberSectionStyles 4.
  - axisFormat `%Y-%m-%d`, tickInterval (pattern, no default), topAxis false, displayMode `''|compact`, weekday `sunday`.
  - `useWidth` (number, no default) and `useMaxWidth` (true) come from `BaseDiagramConfig` L476–490.
- Detector order: `fa796a943:packages/mermaid/src/diagram-api/diagram-orchestration.ts:90–123`: agentflow, c4, kanban, classDiagramV2, er, **gantt**, info, pie, …

## 6. Corpus — `e2e/diagrams/gantt/**/*.mmd`: 52 (nightly-check 33, pr-check 11, visual-check 8)

- Every file has front matter (`description:`); 14 have `config:`.
- click: **0**. vert: 2 (pr: `…with-a-vert-tag`, `…vertical-markers-without-creating-extra-rows…`: 6× duplicate ids `v1`/`v3`/`v2`, last-wins).
- compact: 1 (nightly `should-render-when-compact-is-true`, **legacy top-level `displayMode: compact`**, `HH:mm:ss`).
- excludes: 28 files (multi-line: nightly `…multi-line-excludes-issue-6270`). `includes` statement: 0. `inclusiveEndDates`: 0.
- weekend statement: 4 (nightly fri/sat ×2, sat/sun ×1; pr sat/sun HH:mm:ss). weekday statement: 1 (pr `…1-week-with-the-day-starting-on-monday`).
- topAxis: 2, **config only** (nightly `…1-day-and-topaxis-is-true`, pr `…data-labels-at-the-top…`); the statement is never used.
- tickInterval 14; axisFormat 27; todayMarker 4 (default/hide/style/after-until); milestone 2; until 1; `<br>` 1 (section titles).
- `dateFormat x|X` 3; `D`/`ss` 4. Theme dark ×3; 5-year exclude skip in pr `…very-large-intervals…`.
- Hashtag/semicolon in title/section/task data: 6 nightly. `#A task…` is task text.
- Invalid-date fixture nightly `…issue-1060…`: no `dateFormat` (Date fallback; `2019-09-1`), ids written `:ps`.
- visual-check: 8 themes (default, dark, forest, neutral, redux, redux-dark, redux-color, redux-dark-color). **No neo/neo-dark.**
  - 4 classic ones write `dateFormat :YYYY-MM-DD`, `title :…`, `excludes :…`: the format literally starts with `:`, so every date takes the `Date` fallback and the title starts with `:`.

## 7. The reference implementation — `/Users/knsv/repos/pele` at 3a2f075 (HEAD, "Release: 1.13.0", clean)

- `src/diagrams/gantt/`: axis, dates, db, index, lexer, parser, render, tokens, types (.ts).
- `dates.ts` (380 lines, **no imports**) exports: `MONTHS` L6, `WEEKDAYS` L20, `Unit` L25, `isValid` L27, `isoWeekday` L53, `addDays` L57, `add(date, n, unit)` L78, `format(date, tpl)` L119 (`undefined` for unsupported tokens), `isoDate` L215, `parseStrict(input, tpl, now)` L377.
  - `parseStrict` needs `now` for missing fields (L362–375: day/month/year from `now`).
- `axis.ts` (362 lines) imports only `MONTHS, WEEKDAYS` from `./dates.js` (L1). Exports: `TickUnit` L14 (includes `year`), `autoTicks(start, stop, count)` L196, `intervalTicks(interval, weekday, start, stop, limit)` L216, `timeFormat(spec, date)` L270.
  - `intervalTicks` returns `undefined` over `limit` using `min(step, cycle)·ms`, which is not v12's dayjs-duration estimate (L631–641).
- Headers: the reference implementation files carry only a descriptive comment (dates L1–4, axis L3–4), no licence line. v13 adds the header.
- `tests/gantt/dates.test.ts` (252 lines, 20 `it`): imports `vitest` `{describe, expect, it}`, `axis.js`, `dates.js`, **and `parseDuration` from `src/diagrams/gantt/db.js`** (L4; L170 'reads durations').
  - No `vi`, no `TZ` pin: dates are built with local `new Date(...)` and `NOW = new Date(2031,4,6,9,30,15,250)`.
- `db.ts` imports `PeleError` (`../../errors.js`), `safeUrl` (`../../util/url.js`), dates, types. `parseDuration` L34.
  - So the test's `parseDuration` import must be repointed (to v13's schedule) or copied. db.ts does not come along.
- `tests/compat/gantt/adapter.ts` (110 lines): a `GanttDB extends GanttDb` with v12 getter names, `clear()` = `Object.assign(this, new GanttDb())`; `parser.parse` → `parseGantt`; a `dayjs(text, fmt)` stub for two formats; `convert`.
  - Specs there were ported from mermaid@12.1.0 (`gantt.spec.js` 291 lines, `ganttDb.spec.ts` 622; same 17/28 blocks). `SKIPPED.md` lists none. `tests/gantt/oracle.test.ts`, `stress.test.ts` also exist.
- Licence: `/Users/knsv/repos/pele/LICENSE`, MIT, "Copyright (c) 2026 kepano", plus a Lucide ISC section (not relevant to gantt). No NOTICE file.

## 8. v13 tree (38d663b44)

- Layout (custom): `packages/diagram-timeline/` has `grammar/timeline.ebnf` + `grammar/generated/*`, `scripts/port-v12-specs.ts`, `src/{plugin,index,model,labels,language}.ts`.
  - Subdirectories: `src/parser/{lexer,tokens,parser,ast,detect,index}.ts`, `src/layout/{layout,lr,td,metrics,env,finish,invariants,fixtures,types,index}.ts`, `src/render/{render,paint,index}.ts`, `src/facet/`, `src/v12-specs/{adapter,timeline.spec}.ts`, `src/generated/`.
  - `plugin.ts:16–27` is the `DiagramPlugin` shape (`layoutKind: 'custom'`, no `configDefaults`). `package.json:42–53` `mermaid` manifest; `files: ["dist"]` (timeline has no notices).
  - `diagram-class/package.json:30–33` ships `THIRD_PARTY_NOTICES`. Sequence has the same shape plus `layout/{columns,rows,geometry,bounds}.ts` and `ascii/`.
- `RenderContext`: `packages/core/src/pipeline/types.ts:50–102` (no `now`, no `availableWidth`). **`RenderOptions` is not in core**: `packages/mermaid/src/api.ts:85–108` (`availableWidth` L107).
  - Flow: `api.ts:799–802` passes `width: options?.availableWidth` → `contextFor` (L597, `Units.width` L267) → ctx literal L670; used only inside `ctx.layout()` L700–703.
  - DOM: `packages/mermaid/src/dom.ts:182–196` (`clientWidth − padding`).
- Jison oracle: `packages/conformance/src/jison/{oracle,harvest,types,…}.ts` is merged. `types.ts:116–123` has a **`gantt` descriptor** (probe `gantt\n  title x`, e2e `gantt`, harvest `run` over `parser/gantt.spec.js`, parsers `['parser']`). `smoke.spec.ts:11` lists gantt in M4; `harvest.ts:16` `V12_COMMIT`.
- Notices: per package, e.g. `packages/diagram-class/THIRD_PARTY_NOTICES` (33 lines: "the reference implementation" section, file list, MIT text) and `packages/core/THIRD_PARTY_NOTICES:4–25`.
  - Header form `packages/core/src/layout/layered/layered.ts:1–7`: `// Ported from Pele (https://github.com/obsidianmd/pele), <path> at 3a2f075.` / `// Copyright (c) 2026 kepano. MIT License: see THIRD_PARTY_NOTICES in @mermaid-js/<pkg>.` / `// Changes from Pele: …` / `// cspell:ignore kepano …`.
- Config: statuses live in `packages/core/schema/config.schema.yaml` (generated into `packages/core/src/config/generated/{keys,defaults,config.type}.ts`; `keys.ts:11` `D_GanttDiagramConfig`).
  - `GanttDiagramConfig` L3501–3637: every key `x-mermaid: { status: pending }` (L3526 … L3636).
  - It does **not** redeclare `useWidth`/`useMaxWidth`, which stay pending in `BaseDiagramConfig` L1094–1104. Other types redeclare them (e.g. journey L3013–3021: `useWidth` ignored, "Only v12's gantt renderer read `useWidth`"; `useMaxWidth` honoured).
- Frontmatter: `packages/core/src/preprocess/frontmatter.ts:137–154` moves truthy `displayMode` to `gantt.displayMode` (as a string; a non-map `gantt` is left alone).
- Registry: `packages/mermaid/src/generated/detectors.gen.ts:14` and `registry.gen.ts:34` already list `{ type: 'gantt', pattern: /^\s*gantt/ }` (no id), after `er` and before `info`.
- `PARITY_SUITES`: `packages/conformance/src/registry.ts:17–74` (flowchart, sequence, class, er, state, journey, timeline L52–58, pie, quadrant). Adapter shape `types.ts:8–25`. Per-type dirs (`timeline/{v12,v13,corpus}.ts`, `quadrant/oracle-env.ts`). The oracle `oracle.ts:58–94` has no clock control.
- Theme: none of the 19 new gantt variables are in `packages/core/src/theme/vocabulary.ts` yet.

## 9. Surprises (vs spec #293)

1. Links: v12 wraps a bar and its label in `<a>` **only under `securityLevel: sandbox`** (L514–535, `target=_top`). Otherwise `href` is a JS `window.open(url,'_self')` handler, and `call` binds only under `loose` (L745). The R-SVG-4 `<a>` is a structural change in every other mode; MIGRATION should say so.
2. The exclude-range walk drops a range still open at the domain end (no flush after the loop, L578–595), so trailing excluded days get no `exclude-range` rect. Layout parity must copy this or list it.
3. Lexer keyword traps the spec's T1 list omits: `date` (`\d{4}-\d\d-\d\d\b`, L89) makes a task text starting with an ISO date a syntax error. `click `/`call ` at the start of a task text enter their states (L54, L67). `gantt|topAxis|inclusiveEndDates|weekday …|weekend …` prefixes are keywords (implicit `\b`). Bare `title`/`section` eat the next line (`\s`).
4. Task text keeps trailing spaces (`[^:\n]+`, no trim): `"Completed task            "` is the v12 `task` value. The model and AST must keep them for parity; the renderer collapses them.
5. 4 of 8 visual-check files write `dateFormat :YYYY-MM-DD` / `title :…`. The format starts with `:`, so every date uses the `Date` fallback (UTC midnight), and the title text starts with spaces + `:`. Those baselines show fallback quirks, not normal dates. The corpus has no neo/neo-dark files (D215/D278 baselines need new fixtures).
6. v12's viewBox is fixed `0 0 w h` (L155), not a bbox. Outside-right labels and a wide title can overflow it. D224 (the bbox covers what is drawn) changes the box: list it.
7. `w` falls back to 1200 only when `offsetWidth` is `undefined` (never in a browser); a hidden parent gives `w = 0`. The `1200` default in D272 is a v13 choice, not v12's effective behaviour.
8. `RenderOptions` lives in `packages/mermaid/src/api.ts:85`, not core. T0's "`RenderOptions.now`" is a mermaid-package change; only `RenderContext` (`core/src/pipeline/types.ts:50`) is core.
9. `useWidth`/`useMaxWidth` have no gantt entry in the v13 schema (pending via `BaseDiagramConfig`). T5 must add per-diagram `$ref` overrides like journey L3013–3021, not just flip statuses.
10. Label placement uses `renderEndTime||endTime` for x but `endTime` for the class (L406 vs L444): with excludes a label can sit inside while classed outside, or the reverse. "Placed by v12's rule" has two rules.
11. The reference implementation's `dates.test.ts` imports `parseDuration` from the reference implementation's `db.ts` (which needs `PeleError`, `safeUrl`). D1 must repoint that import. The reference implementation files carry no licence header, so the notice comes only from the v13 header and `THIRD_PARTY_NOTICES`. `intervalTicks`' limit test differs from v12's tick estimate (a month of 365/12 days via dayjs duration).
12. `axisFormat '%d'` for `dateFormat D` compares the **untrimmed** value (`dateFormat  D` with two spaces does not get it). `includes` appears in no corpus file. Exclude matching compares lowercased tokens with `format(dateFormat)`, so a format with capitals (`MMM`) never matches.
13. Only section indices 0–3 are styled (styles.js); `numberSectionStyles > 4` gives unstyled `section4+` bands and bars in v12.
14. `vert` tasks join the time domain (L159–167) but take no row. A chart of only vert markers has a domain but zero rows (D277 covers the drawing). The vert bar's class is usually `task vert  task0`, so it is filled `taskBkgColor`.
