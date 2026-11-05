# Implementer brief (spec #288, M4 pie chart port)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #288 (its "Maintainer decisions" are decided: D220–D229). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md`. **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language). Worked example: `packages/diagram-sequence` (`layoutKind: 'custom'`).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-pie.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** CLAUDE.md. pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-pie` imports only `@mermaid-js/core` subpaths, zero dependencies, never another diagram package.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first.
- **Integration branch:** `feature/288_pie`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/288-pie-bf8b05`. Read only from it; never write there.
- **Parallel M4 sessions** (quadrant, journey, timeline, icons, hand-drawn, the #285 jison oracle) edit shared core files: the theme vocabulary and specs, the conformance registry, the generated registry and config. Never hand-edit generated files (D112); run the `gen:*` script. Keep shared edits small and additive.
- **No AI attribution** in commits (no Co-Authored-By, no "Generated with"). Hosted CI is off on purpose: never edit `.github/workflows/*`.
- **Timing** on this machine is not trusted: timing tests assert ratios (best of N); report gz sizes, and mark any timing "not measured on a steady machine".

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/288_pie HEAD`. If that fails, `git reset --hard feature/288_pie`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, parser/model, layout invariants).
3. Stay within the ticket's scope. If a choice is not covered by the spec, a D-id, DESIGN or REQUIREMENTS, pick the option most consistent with P1/P2 and the D-ids, implement it, and list it under "Deviations" in your reply and handoff (the maintainer is not available; the orchestrator records it in GAPS.md).
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/288_pie` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/288/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it.
