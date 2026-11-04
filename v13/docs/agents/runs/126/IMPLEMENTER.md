# Implementer brief, spec #126 (class diagram)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #126. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D100–D112 are M3's). Recipe: v13/docs/agents/port-diagram/ (README, parser-method, pitfalls, theming).
- Integration branch: `feature/126_class-diagram`. Exception: #152 (T0) is based on `mermaid-js/mermaid-v13` and gets its own PR there (D112), so keep it free of class code.
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Worktree: .claude/worktrees/t<N> on feature/<N>_<short>. Use absolute paths, and stay out of the main checkout and other worktrees. Run `pnpm install` first.
1. Confirm your base: `git merge-base --is-ancestor <base> HEAD`. If that fails, reset onto <base>.
2. Use the Skill tool with `mattpocock-skills:tdd`. Test through `createMermaid().render()`, except where the recipe step names another seam.
3. Stay in the ticket's scope. Touch shared files minimally and additively. Shared generated files (registry, parity suites, config reference, theme variables) are regenerated with `gen:*`, never hand-merged. Escalate decisions (anything against DESIGN, REQUIREMENTS, a D-id, or a v12 default) instead of making them: stop and report the question.
4. Run `pnpm check` until it is green. Commit with no AI attribution (no Co-Authored-By, no "Generated with" line). Don't push, open PRs, or comment on or close issues. Don't edit `.github/workflows/*`. Don't add root scripts.
5. Before reporting, merge <base> and run `pnpm check` again.
6. Write tickets/<N>.md (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
