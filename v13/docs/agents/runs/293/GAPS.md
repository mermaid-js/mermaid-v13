# Gaps (spec #293)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Setup
- **Choice:** the package skeleton (`packages/diagram-gantt`: package.json without the `mermaid` manifest, tsconfigs, README, an empty `src/index.ts`) is on the integration branch before any ticket, so D1 (`src/dates/`) and T1 (`src/parser/`) do not collide on it. `tools/release/src/publish.spec.ts` lists the package.

## Exploration findings (2026-11-06), see `01-v12-gantt.md` "Surprises"

### #375 T0 core
- `RenderOptions` lives in `packages/mermaid/src/api.ts:85`, not in core; only `RenderContext` is in core (`core/src/pipeline/types.ts:50`). The ticket's "`RenderOptions.now` in core" reads as: the option on the `mermaid` API's `RenderOptions`, the resolved value on core's `RenderContext` (and whatever core render-input type carries it there).
- Done (choices): `RenderContext.now` and `availableWidth` are optional, so the hand-built contexts in other packages' fixtures (state, timeline, er, conformance) need no edit. The `mermaid` API always sets `now`. `MountOptions` has no `now`: each mount render defaults it. The "no clock read" check is a lint rule over core and every diagram package's non-spec code, so it covers gantt too. Unmet: none.

### #376 D1 dates
- Pele's source files carry no licence header; the notice comes from Pele's root `LICENSE` (MIT, "Copyright (c) 2026 kepano"). Each ported file gets a header naming Pele, the commit 3a2f075, the path and that notice.
- Pele's `tests/gantt/dates.test.ts` imports `parseDuration` from Pele's `db.ts` (which needs `PeleError`, `safeUrl`). D1 does not port `db.ts`: drop or repoint those cases (T3 owns `parseDuration`).
- **Done (#376):** headers as above; `THIRD_PARTY_NOTICES` lists `src/dates/{axis,dates}.ts`. No unmet criteria.
- **Choice:** `parseDuration` (Pele `db.ts`, v12 `ganttDb.js` L399–407) lives in `src/dates/dates.ts`, so Pele's spec runs unchanged. T3 imports it instead of writing its own.
- **Choice:** `readStartDate`/`readEndDate` (the written-date branches of v12's `getStartDate`/`getEndDate`) are in `src/dates`, so each quirk has a case at the dates seam. `after`/`until`, inclusive ends, the duration fallback and the errors stay in T3.
- **Choice:** Pele's one-entry cache of the compiled parse format is dropped (module state, R-ARCH-4), and its long `switch`es are lookup tables (lint: complexity, nested ternaries; no new suppressions). A 20,000-case random comparison per zone shows 0 differences from Pele's code.
- **Choice:** the TZ mechanism is three vitest projects in the root config (`workspace` without gantt, `gantt-utc`, `gantt-la`). Gantt specs run only pinned, never in the host zone. Specs read the zone through `Intl` (the package has no Node types).
- Oracle: the only difference from v12's dayjs is that dayjs fills fields a format omits (`HH:mm` gets today's date) from the real clock, while this port uses `now` (D270).

### #379 T3 (from #376)
- [x] `intervalTicks(…, limit)` uses Pele's tick estimate, not v12's `getEstimatedTickCount` (dayjs duration, 30-day month). For v12's warning and auto-tick fallback, T3 runs v12's estimate itself. (Done: `layout/ticks.ts`.)

### #377 T1 lexer
- Traps beyond the ticket's list: the `date` rule (`\d{4}-\d\d-\d\d\b`) makes task text that starts with an ISO date a syntax error; `click ` / `call ` at the start of a task text enter their start conditions; `gantt`, `topAxis`, `inclusiveEndDates`, `weekday …`/`weekend …` are keywords with jison's implicit `\b`; task text keeps trailing spaces. The gate decides; keep them.
- The shared oracle already has a `gantt` descriptor (`packages/conformance/src/jison/types.ts:116`).
- **Done (#377):** every trap above is kept and gated (edge cases in `conformance/src/gantt/corpus.ts`). Gate: 100% over 914 sources; no unmet criteria.
- **Choice:** `ganttDb.spec.ts` never calls `parse`, so `harvest gantt` finds nothing in it and the shared descriptor is unchanged. Its DB calls are written as gantt text (`DB_SPEC_CASES`, one source per spec block) in the gate's corpus instead.
- **Choice:** `%%{` with no word after it (no directive to v12) reaches jison's first rule, which begins an undeclared state: jison throws on the next token. v13 emits `OpenDirective`, then an `Error` token to the line end, and lexes on (T2 reports it).
- **Choice:** an unclosed `%%{word` is left out of the gate: v12's directive regex removed more text after it than v13's preprocess does (the decided divergence `quadrant-cases/unclosed-directive`).
- **Choice:** jison's last rule `.` (`INVALID`) is unreachable in gantt (`[^:\n]+`, `:` and `[\n]+` take every character), so there is no `Invalid` kind.
- **Choice:** jison's `\b` is tested with ASCII word characters (JS `\b`), not parser-kit's Unicode `isWord`: `ganttä` lexes as `gantt` + `ä…` in v12. (Timeline's lexer uses `isWord` there; not changed here.)

### #379 T3 schedule and layout
- [x] From the #376 review: gantt's conformance specs ran in the host zone. Done: `vitest.config.ts` adds `packages/conformance/src/gantt/**/*.spec.ts` to `gantt-utc` and `gantt-la` and excludes it from `workspace` (schedule parity, layout invariants, stress, the lexer gate and T2's grammar specs all run twice).
- [x] From the #375 review: a non-finite `ctx.now` (an invalid `Date` reaches it as `NaN`). Done as the planned choice: `layoutGantt` throws `MermaidError('INTERNAL', 'A gantt chart needs a valid "now" …')` before scheduling, also when `now` is absent.
- [x] `NOT_DRAWN_YET` (Setup): gantt reads `fontFamily` and `fontSize`, so the set is empty and `TEXT_USERS` lists gantt. The theme scan now tests `Object.hasOwn(THEME_VARIABLES, n)`: gantt's `'__proto__'` literal (v12's plain-object `taskDb`) matched the prototype through `in`.
- [x] From T2: the three `#379` rows of `divergences.json` are gone (the parity adapter runs `schedule()` at `GANTT_PARITY_NOW`); the two skipped parser specs run (the adapter schedules, and keeps every parse until `clear()`, as v12's DB did).
- [x] #378 review findings routed here: a task with more than three fields has id `''` and the statement's AST id, and the next task no `prevId` (v12 left both undefined; the schedule still rejects the task first); parser parity compares the `weekday` statement raw, sections by index and clicks one entry per id (`setWeekday`, `addSection`, `addTask` recorded in `oracle-env.ts`); the spec adapter skips `setAccDescription` for an empty `accDescr { }` and gives `raw.data` cooked.
- Followed v12: the exclude walk drops a run still open at the end of the domain; a label's `x` reads `renderEndTime`, its `side` (class, anchor) `endTime`; v12's object-key order for section rows (integer-like names first) and `numberSectionStyles` slots from first appearance.
- **Choice:** a task that never resolves (a cycle of `after`/`until`) keeps its row (compact: no lane) and draws no bar or label, without a warning (D276 names two codes). v12 drew NaN.
- **Choice:** interval ticks are also capped at 10,000 actual ticks (Pele's estimate in `intervalTicks`), falling back to automatic ticks with the warning; v12 drew whatever its own estimate let through (`30hour` over 33 years: ~12,000).
- **Choice:** new warning codes for v12's other `log.warn`s and bad config: `GANTT_EXCLUDES_NOT_DRAWN` (span over five years), `GANTT_TICK_INTERVAL_IGNORED`, `GANTT_CONFIG_IGNORED` (a `gantt.*` length not a number ≥ 0, `numberSectionStyles` < 1, a font size that is no CSS size).
- **Choice:** schedule errors are diagnostics `GANTT_INVALID_DATE`, `GANTT_NO_START`, `GANTT_TOO_MANY_FIELDS`, `GANTT_EXCLUDED_ALL` at the task's `dataRange`; messages keep v12's `Invalid date:<text>` and its 10,000-iterations sentence.
- **Choice:** an `x`/`X` timestamp past the `Date` range is an invalid date (v12 scheduled an Invalid Date and drew NaN); a negative bar width (`until` before the start) is 0.
- **Choice:** task labels are measured as drawn (pitfall 16): bold when clickable (`.taskText.clickable`), italic for milestones; v12 measured them before their classes were set. `&`, `<` and `\n` are escaped so labels show as written; `$$…$$` passes through for math (D176). Section titles break on v12's `lineBreakRegex` (`</br>` too).
- **Choice:** the bounds are v12's `0 0 w h` grown to what is drawn (D224). A one-instant domain maps to the plot's middle with no automatic ticks (d3's step is infinite there); d3's 0.5 px tick offset is not applied.
- **Choice:** with no resolved task that takes a row (only settings, only `vert` markers, only cycles) there is no domain (D277): no bars, markers, ticks or today line; rows of unresolved tasks keep their bands and section titles.
- **Choice:** schedule parity compares id, times, `renderEnd`, `manualEnd`, order and tags; texts and sections are the parser parity's (v12's entity placeholders are normalised there). It runs at `GANTT_PARITY_NOW` only: the oracle env runs `getTasks()` inside `parse`, and a second call would start from the first call's dates.
- **For the maintainer (R-SEC-5, unbounded scheduling):** inside v12's caps the schedule's work has no bound, and #379 adds no limit (spec "Further Notes"). `fixTaskDates` walks every day of a task's span once per pass whenever `excludes` is set; v12 caps only the start year (|year| ≤ 10000) and the days *pushed* (10,000), not the span. Shape: ~1,900 tasks `t :tN,2000-01-01,9000y` (26 characters each, inside the 50,000-character source cap) with `excludes 1999-01-01` (a token that never matches, so nothing is pushed and the guard never fires); one pass, as every task resolves. Measured: one such task 1.6 s, four 5.6 s; extrapolated ~45 min for the source-cap chart, ×11 (~8 h) when one unresolved task (a cycle of `after`) forces all eleven passes. Not measured on a steady machine. A dense exclude (`monday`) is bounded: the 10,000-push guard throws after ~190 years of span. Prior art: Pele's `WORK_LIMIT = 4e8` (`/Users/knsv/repos/pele/src/diagrams/gantt/db.ts:23`, charged per walked day L393, per formatted day L249–251 and per parse L267, thrown as a `limit` error L259–263). Cost of a limit here: a work counter in `Scheduler` (`schedule/schedule.ts`, ~150 B gz) plus a decision on the error: `LIMIT` would need a new `Limits` key and code in core (`limits/index.ts`, integrator-only per R-SEC-5), `SEMANTIC` needs nothing in core. The shape is an `it.skip` in `packages/conformance/src/gantt/schedule-stress.spec.ts`, ready to enable.

### #381 T4 renderer
- v12 wraps bar and label in `<a>` only under `securityLevel: sandbox` (`target=_top`); otherwise `href` is a `window.open(_self)` handler and `call` binds only under `loose`. The spec's static `<a href>` (R-SVG-4, D23, D62) stands; MIGRATION.md says so.

### #385 T5 integration
- v13's `GanttDiagramConfig` does not redeclare `useWidth`/`useMaxWidth`; they stay pending through `BaseDiagramConfig`. Needs per-diagram overrides as journey has.
- The corpus has no `click` and no neo/neo-dark files; `topAxis` only in config; compact only through legacy front matter. 4 of 8 visual-check files write `dateFormat :YYYY-MM-DD` (every date takes the `Date` fallback; the title starts with `:`).

## Setup (skeleton)
- `tools/gen-config/src/theme-used-by.spec.ts` requires every `packages/diagram-*` to read a theme variable. The skeleton reads none, so the spec lists gantt in `NOT_DRAWN_YET`, where a package must read **none**. **#379 (T3) removes the entry** when gantt reads its first variable (the spec then fails until it does). Done (#379). `.changeset/diagram-gantt-first-release.md` added for the release spec.

### #377 review findings, owned by #378 (T2)
- [x] The probe records `after + 1` for non-INITIAL steps, so a value at the end of the text reports an end past `src.length` (`lexer.ts` `run`). Clamp it.
- [x] `%%{` at a line end gives a zero-width `Error` token; give it a visible range before T2 turns it into a diagnostic. (The token stays; the diagnostic covers `%%{` and its `Error`.)
- [x] `valueKeyword()` tries all eight keywords at every token start; dispatch on the first letter as `keywords()` does.
- [x] `ganttTokens` copies `timelineTokens`; use `significantTokens()` for the trivia filter.
- [x] The gate's `skipped.length < 4` repeats the filter check; assert the exact skipped ids.

### #378 T2 parser
- **Choice:** D274 wins over the ticket's "rejected as v12 rejects" list: `parse()` rejects only what v12's parse rejects (syntax, and tags-only data in `addTask`, `GANTT_TASK_NO_DATA`). Too many fields, a first task with no start and invalid dates reach the model raw (`fields`, `prevId`, `start`/`end`) for T3. "A tag after a non-tag field" is no v12 check (`:2024-01-01, crit` is accepted, end `crit` a bad duration; `:a, done, 1d` an invalid date at schedule).
- **Choice:** the model carries `source` (the parsed text) and each task its `range` and `dataRange`, so layout can raise schedule errors as `SEMANTIC` with the task's position (D274) without a core change.
- **Choice:** a task with more than three fields takes `fields[0]` as its id (v12 gave none and counted none); the render fails there anyway (T3). *(Changed in #379: the id is `''`, see #379.)*
- **Choice:** the in-text title replaces the front-matter one even when blank (v12 set the front-matter title first, then `setDiagramTitle` again); `titleAst` marks an in-text title. The oracle never passes front matter's title on, so parity compares the in-text title only.
- **Choice:** v12's never-cleared `taskDb` made oracle acceptance depend on earlier charts in one case (a first one-field task resolves `taskDb.undefined` after a chart with a 4+-field task); the oracle env throws v12's own `TypeError` there, as on a fresh page. Click data is recorded from the grammar's calls, so stale ids never reach the snapshot. Stale `after`/`until` resolution only moves dates: T3 compares those against the today fallback.
- **Choice:** the oracle's fixed clock is a `Date` swap (`atFixedTime`), not `vi.setSystemTime`, so the oracle CLI (`tsx`) works too.
- Unmet: the two ported parser specs that read `startTime`/`endTime` are skipped until T3 (reason in `scripts/port-v12-specs.ts`), not oracle-backed. *(Done in #379.)*
- For T3: remove the three `#379` rows of `divergences.json` once the adapter runs `schedule()`; `GANTT_PARITY_NOW` is in `conformance/src/gantt/oracle-env.ts`.
- Follow-up (coordinator, not gantt): T1 says timeline's lexer tests jison's `\b` with parser-kit's Unicode `isWord`, though JS `\b` is ASCII-only, so it may be a latent parity bug there.

### #385 T5 integration (coordinator, 2026-11-06)
- [x] Core size: #410 (`fix/theme-variables-pure`, the theme vocabulary built in a pure call) is merged into `mermaid-v13` (586e00c8f) and from there into `feature/293_gantt`. It freed about 1.4 KB of core. `cdn-build.spec.ts` now fails if a theme table not built in a pure call lands in core: T5 wraps any table gantt adds the way `THEME_VARIABLES` and `PIE_SLOTS` are wrapped in `packages/core/src/theme/vocabulary.ts`, and keeps gantt's variables in the existing vocabulary pattern. Draft #411 (D322, a "Theme T0" moving per-type variables out of core) is not decided; don't wait on it.
- Maintainer decision (via the coordinator, 2026-11-06): **wave 2 first**. Gantt lands before the Theme T0 (D322, draft #411), which moves gantt's theme variables out of core later. T5 keeps the existing vocabulary pattern and pure-call tables and does not plan for that T0.
- [ ] **Core room:** gantt's and mindmap's theme variables share about 930 B on the CDN measure (the CDN ESM closure, 92,520 B after #410, as well as the bench measure). Keep gantt's rows lean: add only variables whose values differ between families (theming.md), alias existing variables where v12 does, and aim for at most half (~465 B). Report both measures with what each row costs. If it would need more, stop and report the bytes (coordinator decides).
