# Implementer brief — spec #127 (M3 state diagram)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #127. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D100–D112; D112 may only be on `mermaid-js/docs/m3-specs` — `git show mermaid-js/docs/m3-specs:v13/docs/DECISIONS.md`). Recipe: v13/docs/agents/port-diagram/ (README, parser-method, pitfalls, theming). Worked example: `packages/diagram-flowchart`, `packages/conformance`.
- v12 source: `git show fa796a943:packages/mermaid/src/diagrams/state/…`. Oracle: the `mermaid-v12` dev dependency in `packages/conformance`. Corpus: `e2e/diagrams/state-diagram/**/*.mmd` (42), `e2e/diagrams/state-diagram-v2/**/*.mmd` (103).
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Integration branch: `feature/127_state-diagram` (worktree `.claude/worktrees/compassionate-poitras-036dad`). Your worktree: `.claude/worktrees/t<N>` on `feature/<N>_<short>`. Use absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Constraints: a diagram package imports only from `@mermaid-js/core` subpaths. No core change from a state ticket — a needed core change is a state T0 for the maintainer (D102, D111). Shared generated files (registry, parity suites, config reference, theme variables) are touched additively and regenerated, never hand-merged (D112). Don't edit `.github/workflows/*`. Don't add root package.json scripts. Cite R-ids/D-ids where a choice rests on one.

1. Confirm your base: `git merge-base --is-ancestor feature/127_state-diagram HEAD`. If that fails, reset onto feature/127_state-diagram.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the ticket names another seam (lexer gate: token streams; layout: `LayoutGraph → LayoutModel`).
3. Stay in the ticket's scope. Touch shared files minimally and additively. Escalate decisions (anything contradicting DESIGN, REQUIREMENTS, a D-id or a v12 default) in your reply instead of making them.
4. Run `pnpm check` until it is green. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge `feature/127_state-diagram` and run `pnpm check` again.
6. Write `v13/docs/agents/runs/127/tickets/<N>.md` in your branch (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria. Commit it.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
