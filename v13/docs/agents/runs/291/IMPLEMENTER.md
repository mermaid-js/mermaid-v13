# Implementer brief (spec #291, M4 timeline port)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #291 (its "Maintainer decisions" are decided). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D210–D309 from #284 are merged into the integration branch; D224–D227 are in pie's block and apply here). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language).
- **Notes:** this folder. Read `INDEX.md`, `01-v12-timeline.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** CLAUDE.md. pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-timeline` imports only `@mermaid-js/core` subpaths, never another diagram package. Worked example: `packages/diagram-sequence` (custom layout, jison port).
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first.
- **Integration branch:** `feature/291_timeline`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/291-timeline-3d8a8e`. Read only from it; never write there.
- **Parallel M4 sessions** (pie, quadrant, journey, icons, hand-drawn, the #285 oracle) touch shared core files: theme vocabulary and specs, the conformance registry, the generated registry and config. Never hand-edit generated files beyond what `gen:*` produces (D112); keep shared edits small and additive.
- **Decisions:** not covered by the spec or a D-id? Choose the option most consistent with P1/P2, the spec and the D-ids, implement it, and say so under "Deviations" in your reply. Don't wait for an answer.
- **Hosted CI is off.** Never edit `.github/workflows/*`. The user is remote: never hard-code hostnames.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/291_timeline HEAD`. If that fails, `git reset --hard feature/291_timeline`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, layout invariants).
3. Stay within the ticket's scope.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/291_timeline` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/291/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it. Timing numbers from this machine are "not measured on a steady machine"; report gz sizes.
