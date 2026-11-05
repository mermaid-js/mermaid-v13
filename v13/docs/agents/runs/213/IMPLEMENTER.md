# Implementer brief — spec #213 (M3.5 neo and neo-dark themes)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #213. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D180–D183 in the M3.5 section; free ids D184–D189 are the coordinator's to assign). Recipe: v13/docs/agents/port-diagram/theming.md. Theme code: `packages/core/src/theme/` (specs in `specs/`, registry in `registry.ts`), SVG writer and allow-list in `packages/core/src/svg/`.
- v12 oracle is 12.2.0: `git show fa796a943:packages/mermaid/src/themes/theme-neo.js` (and `theme-neo-dark.js`, `styles.ts`, `rendering-util/insertLookDefs.ts`, per-type `diagrams/<type>/styles.*`). Resolved values: the `mermaid-v12` dev dependency in `packages/conformance`.
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Integration branch: `feature/213_neo-themes` (worktree `/Users/knsv/repos/mermaid-v13/.claude/worktrees/m35-neo-themes-515e57`). Your worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Use absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Constraints: no renderer checks a theme name or a look (D152). Fonts stay uniform across diagrams (no per-diagram font defaults). Generated files (config types, config reference, theme variable table, registry) are regenerated with `pnpm gen:config` / `gen:theme` / `gen:registry`, never hand-merged (D112). Don't edit `.github/workflows/*`. Don't add root package.json scripts. Cite R-ids/D-ids where a choice rests on one. Any value that departs from v12 and that D180–D183 don't cover is an escalation, not a choice.

1. Confirm your base: `git merge-base --is-ancestor feature/213_neo-themes HEAD`. If that fails, reset onto feature/213_neo-themes.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()` or `createTheme()`, as the ticket's seam says.
3. Stay in the ticket's scope. Touch shared files minimally and additively. Escalate decisions (anything contradicting DESIGN, REQUIREMENTS, a D-id or a v12 value) in your reply instead of making them.
4. Run `pnpm check` until it is green. Machine-wide, only one full check and one e2e run at a time: run them as `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` and `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock pnpm e2e`. A timing test that fails under load is not a regression; rerun it under the lock. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge `feature/213_neo-themes` and run `pnpm check` again.
6. Write `v13/docs/agents/runs/213/tickets/<N>.md` in your branch (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria. Commit it.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
