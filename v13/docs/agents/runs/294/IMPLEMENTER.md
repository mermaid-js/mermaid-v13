# Implementer brief (spec #294, M4 mindmap port and the core `tree` engine)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #294 (its "Maintainer decisions" are decided: D283–D289). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D280–D313; D224–D227 are in pie's block and apply here). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-mindmap.md`, `02-v13-core.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** CLAUDE.md. pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-mindmap` imports only `@mermaid-js/core` subpaths, never another diagram package. Worked examples: `packages/diagram-timeline` (jison port, M4), `packages/diagram-class` / `diagram-state` (graph layout through `ctx.layout()`).
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first (and again after adding a package, or lint fails on a stale ESLint cache).
- **Integration branch:** `feature/294_mindmap`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/294-mindmap-0229e0`. Read only from it; never write there.
- **Parallel M4 sessions:** gitGraph (#292) and gantt (#293) run at the same time. Gantt's T0 changes core's render context (`now`, `availableWidth`); gitGraph adds `git*` palettes. Keep shared core edits small and additive. Never hand-edit generated files (registry, detectors, config, facets, grammars, theme tables) beyond what `gen:*` produces (D112).
- **Core size (R-PERF-8):** `packages/bench/src/core-size.spec.ts`, limit 94,208 B gz, about 650 B spare. Measure before and after any change that touches core or the registry and report both numbers. If you would go over: stop, don't trim unrelated code, don't touch the budget or the gate; report the bytes per item.
- **Decisions:** not covered by the spec or a D-id? Choose the option most consistent with P1/P2, the spec and the D-ids, implement it, and say so under "Deviations" in your reply. Don't wait for an answer.
- **Never** edit `.github/workflows/*`. The user is remote: never hard-code hostnames.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/294_mindmap HEAD`. If that fails, `git reset --hard feature/294_mindmap`.
2. Use the Skill tool with `tdd` (and `ddlt` for layout work). Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, layout invariants).
3. Stay within the ticket's scope.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/294_mindmap` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/294/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, core size before/after, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it. Timing numbers from this machine are "not measured on a steady machine"; report gz sizes. Linear-time checks are ratio tests.
