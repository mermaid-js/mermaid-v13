# Implementer brief: spec #124 (ER diagram port)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #124. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D100–D112 for M3). Recipe: v13/docs/agents/port-diagram/ (README, parser-method, pitfalls, theming).
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Worktree: /Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N> on feature/<N>_<short>. Use absolute paths, and stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Integration branch: `feature/124_er-diagram`.
- Shared machine: one full `pnpm check` and one Playwright e2e run at a time across all M3 sessions. Run `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` and `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <e2e command>`. A timing test that fails under load is not a regression; rerun it under the lock before acting on it.

1. Confirm your base: `git merge-base --is-ancestor feature/124_er-diagram HEAD`. If that fails, reset onto feature/124_er-diagram.
2. Use the Skill tool with `mattpocock-skills:tdd`. Test through `createMermaid().render()`, except where the recipe step names another seam (T1: the conformance lexer-parity suite).
3. Stay in the ticket's scope. Touch shared files minimally and additively. Generated files (registry, parity suites, config reference, theme variables) come from `gen:*` scripts; never hand-edit them (D112). Escalate decisions that contradict DESIGN, REQUIREMENTS or a D-id instead of making them: stop and report.
4. Run `pnpm check` until it is green. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge feature/124_er-diagram and run `pnpm check` again.
6. Write tickets/<N>.md (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria. Commit it on your branch.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
