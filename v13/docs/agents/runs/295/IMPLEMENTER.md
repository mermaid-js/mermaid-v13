# Implementer brief — spec #295 (M4 icons plugin)

- Ticket: `gh -R mermaid-js/mermaid-v13 issue view <N>`. Spec: `gh -R mermaid-js/mermaid-v13 issue view 295` (its "Maintainer decisions" section is decided). Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md; D290–D299 are on the integration branch. This is a plugin spec, not a port: no parser/oracle steps. Model: `packages/plugin-math` and run notes `v13/docs/agents/runs/215/`.
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker. Notes not yet on your base are readable at the integration worktree `/Users/knsv/repos/mermaid-v13/.claude/worktrees/295-icons-e966ee` (read only, never write there).
- Integration branch: `feature/295_icons`. Your worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Use absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Constraints: core and `diagram-*` never import or name the plugin (D153); dependencies point plugin → core. No Node imports in core/diagram-* (R-ARCH-1). Output stays byte-identical without an icons extension. No sanitizer: icon bodies become allow-listed nodes (R-SEC-2). Shared generated files (registry, config reference, schema) are regenerated with `gen:*`, never hand-merged (D112). Never edit `.github/workflows/*`. Don't add root package.json scripts. No TS enums; no console in shipped packages.
- Other M4 sessions (pie, quadrant, journey, timeline, hand-drawn, the #285 oracle) edit shared core files in parallel (label layout, render context, allow-list, theme vocabulary). Keep shared edits small and additive.
- When the spec and D-ids don't cover a choice, pick the option most consistent with P1/P2, the spec and the D-ids, implement it, and report it in your reply as a "decision" so it is recorded in GAPS.md. Don't stop to ask.

1. Confirm your base: `git merge-base --is-ancestor feature/295_icons HEAD`. If that fails, reset onto feature/295_icons.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except I1, which is pure and has its own seam.
3. Stay in the ticket's scope. Touch shared files minimally and additively.
4. Run `pnpm check` until it is green. Machine-wide, only one full check and one e2e run at a time: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` and `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock pnpm exec playwright test <spec>`. This machine is loaded: a timing test that fails is not a regression; rerun it under the lock, and never report timing numbers as measured. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge `feature/295_icons` and run `pnpm check` again.
6. Write `v13/docs/agents/runs/295/tickets/<N>.md` in your branch (≤ 40 lines): exports, how to use them, test helpers, gz sizes, decisions, unmet criteria. Commit it.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations/decisions, unmet criteria.
