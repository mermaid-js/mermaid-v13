# Implementer brief — spec #37 (M2 ASCII)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #37. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D11, D24, D57, D58, D76–D87, D140; DESIGN §6.3). Research: v13/docs/research/{ascii-snapping,mermaid-ascii}.md. Recipe: v13/docs/agents/port-diagram/.
- Already merged on the integration branch: #39 (research/ascii-snapping.md), #40 (packages/conformance ascii fixtures, PR #53), #41 (UnitProfile, PR #75), #44 (core/ascii kit, PR #76). Read their PRs (`gh pr view -R mermaid-js/mermaid-v13 <pr>`) when you build on them.
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Integration branch: `feature/37_m2-ascii` (worktree `.claude/worktrees/int37`). Your worktree: `.claude/worktrees/t<N>` on `feature/<N>_<short>`. Use absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Constraints: the `core/ascii` import boundary (eslint `mermaid/import-boundaries`) stays as is — only ASCII code imports `core/ascii`, SVG code never does. Don't edit `.github/workflows/*`. Don't add root package.json scripts. Cite R-ids/D-ids in comments and commits where a choice rests on one.

1. Confirm your base: `git merge-base --is-ancestor feature/37_m2-ascii HEAD`. If that fails, reset onto feature/37_m2-ascii.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the ticket names another seam (engine: `LayoutGraph → LayoutModel`; kit: table tests).
3. Stay in the ticket's scope. Touch shared files minimally and additively. Escalate decisions (anything contradicting DESIGN, a D-id or a v12 default) in your reply instead of making them.
4. Run `pnpm check` until it is green. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge `feature/37_m2-ascii` and run `pnpm check` again.
6. Write `v13/docs/agents/runs/37/tickets/<N>.md` in your branch (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria. Commit it.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
