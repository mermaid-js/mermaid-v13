# Implementer brief (spec #292, M4 gitGraph port)

- **Ticket:** `gh -R mermaid-js/mermaid-v13 issue view <N>`. **Spec:** #292 (its "Maintainer decisions" are decided: D260–D269). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (D224–D227 are in pie's block and apply here). **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming, language). Worked examples: `packages/diagram-pie` (Langium port, custom layout), `packages/diagram-timeline` (palettes, custom layout), `packages/diagram-sequence`.
- **Notes:** this folder. Read `INDEX.md`, `01-v12-gitgraph.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** CLAUDE.md. pnpm; no TS enums; no console in shipped packages. `@mermaid-js/diagram-gitgraph` imports only `@mermaid-js/core` subpaths, zero dependencies, never another diagram package.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first (and again after adding a package, or lint fails on a stale ESLint cache).
- **Integration branch:** `feature/292_gitgraph`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/292-gitgraph-edef1a`. Read only from it; never write there.
- **Parallel sessions** (gantt #293, mindmap #294) touch the same shared files: theme vocabulary and specs, the conformance registry, the generated registry, config and grammars. Never hand-edit or hand-merge generated files (D112); run the `gen:*` script. Keep shared edits small and additive. The Langium oracle (`packages/conformance/src/langium-lexer.ts`) gets one additive descriptor row only.
- **Core size (R-PERF-8):** a ticket that touches core or registers the diagram measures `packages/bench/src/core-size.spec.ts` (limit 94,208 B gz) before and after and reports both, with what costs what. If it would go over: stop. Do not trim unrelated code, raise the budget or loosen the gate; report the bytes.
- **Decisions:** not covered by the spec, a D-id, DESIGN or REQUIREMENTS? Choose the option most consistent with P1/P2, the spec and the D-ids, implement it, and list it under "Deviations" in your reply and handoff. Don't wait for an answer.
- **No AI attribution** in commits (no Co-Authored-By, no "Generated with"). Never edit `.github/workflows/*`. Never loosen or skip a gate.
- **Timing** on this machine is not trusted: timing tests assert ratios (best of N); report gz sizes; mark timing "not measured on a steady machine".

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/292_gitgraph HEAD`. If that fails, `git reset --hard feature/292_gitgraph`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, parser/model, layout invariants).
3. Stay within the ticket's scope.
4. `pnpm check` must pass, and the `packages/conformance` specs (pitfall 26). Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/292_gitgraph` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/292/tickets/<N>.md`, committed on your branch: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.

## Machine-wide locks (many sessions share one machine)

- Every full `pnpm check`: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`.
- Every Playwright e2e run: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <command>`.
- A timing test that fails under load is not a regression: rerun it under the lock before acting on it.
