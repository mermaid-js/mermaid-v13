# Implementer brief (spec #293, M4 gantt port)

`$REF` is the reference implementation's checkout (D770).

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #293 (its "Maintainer decisions" are decided: D270–D279). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D224–D227 are in pie's block and apply here). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-gantt.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** CLAUDE.md. pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-gantt` imports only `@mermaid-js/core` subpaths, never another diagram package. Worked examples: `packages/diagram-timeline` and `packages/diagram-sequence` (custom layout, jison port).
- **The reference implementation** (`$REF`, MIT © kepano, commit 3a2f075): `src/diagrams/gantt/` is prior art. `dates.ts` and `axis.ts` are ported (D271) with the notice kept; `db.ts` is a scheduling reference; `render.ts` is not (its look differs from v12). Read it; never edit it.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`, cut from `feature/293_gantt`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first.
- **Integration branch:** `feature/293_gantt`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/293-gantt-349dd8`. Read only from it; never write there.
- **Parallel M4 sessions** (gitGraph #292, mindmap #294) touch shared core files: theme vocabulary, the conformance registry, the generated registry and config, `tools/release/src/publish.spec.ts`. Never hand-edit generated files beyond what `gen:*` produces (D112); keep shared edits small and additive. Mindmap's T0 changes core layout selection: keep core edits minimal.
- **Core size (R-PERF-8):** core has about 650 B spare of 94,208 B (`packages/bench/src/core-size.spec.ts`). A ticket that touches core or registers gantt measures it and reports the bytes in its handoff. If gantt's changes would pass the limit, do not trim unrelated code, raise the budget or loosen the gate: stop and report what costs what.
- **Time:** local time (D270). Gantt specs run under `TZ=UTC`, plus a second run under `TZ=America/Los_Angeles` (D1 sets up the mechanism; later tickets reuse it). Core never reads the clock; specs pass a fixed `now`.
- **Decisions:** not covered by the spec or a D-id? Choose the option most consistent with P1/P2, the spec and the D-ids, implement it, and say so under "Deviations" in your reply. Don't wait for an answer.
- **CI:** hosted CI runs on the integration PR and red blocks merging. Never edit `.github/workflows/*`, never loosen or skip a gate. The user is remote: never hard-code hostnames.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/293_gantt HEAD`. If that fails, `git reset --hard feature/293_gantt`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, schedule parity, layout invariants, dates).
3. Stay within the ticket's scope.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/293_gantt` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/293/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria. Add your choices and unmet criteria to `GAPS.md` under your ticket.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it. Timing numbers from this machine are "not measured on a steady machine"; report gz sizes.
