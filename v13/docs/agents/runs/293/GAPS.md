# Gaps (spec #293)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Setup
- **Choice:** the package skeleton (`packages/diagram-gantt`: package.json without the `mermaid` manifest, tsconfigs, README, an empty `src/index.ts`) is on the integration branch before any ticket, so D1 (`src/dates/`) and T1 (`src/parser/`) do not collide on it. `tools/release/src/publish.spec.ts` lists the package.

## Exploration findings (2026-11-06), see `01-v12-gantt.md` "Surprises"

### #375 T0 core
- `RenderOptions` lives in `packages/mermaid/src/api.ts:85`, not in core; only `RenderContext` is in core (`core/src/pipeline/types.ts:50`). The ticket's "`RenderOptions.now` in core" reads as: the option on the `mermaid` API's `RenderOptions`, the resolved value on core's `RenderContext` (and whatever core render-input type carries it there).

### #376 D1 dates
- Pele's source files carry no licence header; the notice comes from Pele's root `LICENSE` (MIT, "Copyright (c) 2026 kepano"). Each ported file gets a header naming Pele, the commit 3a2f075, the path and that notice.
- Pele's `tests/gantt/dates.test.ts` imports `parseDuration` from Pele's `db.ts` (which needs `PeleError`, `safeUrl`). D1 does not port `db.ts`: drop or repoint those cases (T3 owns `parseDuration`).

### #377 T1 lexer
- Traps beyond the ticket's list: the `date` rule (`\d{4}-\d\d-\d\d\b`) makes task text that starts with an ISO date a syntax error; `click ` / `call ` at the start of a task text enter their start conditions; `gantt`, `topAxis`, `inclusiveEndDates`, `weekday …`/`weekend …` are keywords with jison's implicit `\b`; task text keeps trailing spaces. The gate decides; keep them.
- The shared oracle already has a `gantt` descriptor (`packages/conformance/src/jison/types.ts:116`).

### #379 T3 schedule and layout
- v12's exclude-range walk never pushes a range still open at the end of the domain, so trailing excluded days get no rect. Follow v12 (P2) unless it breaks an invariant.
- A label's x uses `renderEndTime`, its class uses `endTime`; with excludes they can disagree. Follow v12.
- v12's 1200 px fallback never fires in a browser (it reads `offsetWidth`); D272 makes it the default without `availableWidth`.

### #381 T4 renderer
- v12 wraps bar and label in `<a>` only under `securityLevel: sandbox` (`target=_top`); otherwise `href` is a `window.open(_self)` handler and `call` binds only under `loose`. The spec's static `<a href>` (R-SVG-4, D23, D62) stands; MIGRATION.md says so.

### #385 T5 integration
- v13's `GanttDiagramConfig` does not redeclare `useWidth`/`useMaxWidth`; they stay pending through `BaseDiagramConfig`. Needs per-diagram overrides as journey has.
- The corpus has no `click` and no neo/neo-dark files; `topAxis` only in config; compact only through legacy front matter. 4 of 8 visual-check files write `dateFormat :YYYY-MM-DD` (every date takes the `Date` fallback; the title starts with `:`).
