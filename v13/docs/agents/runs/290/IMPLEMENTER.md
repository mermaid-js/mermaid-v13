# Implementer brief: spec #290 (user journey port, `@mermaid-js/diagram-journey`)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #290 (its "Maintainer decisions" are decided). Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D210–D227 for wave 1, D240–D249 for journey; D224–D227 are in pie's block and apply here). Recipe: v13/docs/agents/port-diagram/ (README, parser-method, pitfalls, theming, language).
- Tickets: T1 #310 lexer gate, T2 #302 parser/model/AST, T3 #303 layout, T4 #319 renderer, T5 #327 integration, T6 #331 language facet. Worked example: `packages/diagram-sequence` (`layoutKind: 'custom'`).
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Worktree: /Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N> on feature/<N>_<short>. Use absolute paths, and stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Integration branch: `feature/290_journey`.
- Shared machine: many agents run here. One full `pnpm check` at a time: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check`. Timing numbers are not trusted here: report gz sizes, mark timing "not measured on a steady machine". A timing test that fails under load is not a regression; rerun it under the lock before acting on it.
- Parallel M4 sessions (pie, quadrant, timeline, icons, hand-drawn, #285 oracle) edit shared core files: theme vocabulary and DSL, conformance registry, generated registry and config. Keep shared edits small and additive. Generated files come from `gen:*` scripts; never hand-edit them.
- Never edit `.github/workflows/*`.

1. Confirm your base: `git merge-base --is-ancestor feature/290_journey HEAD`. If that fails, reset onto feature/290_journey.
2. Use the Skill tool with `mattpocock-skills:tdd`. Test through `createMermaid().render()`, except where the recipe step names another seam (T1: the conformance lexer-parity suite; T2: parity suites; T3: the layout function on models).
3. Stay in the ticket's scope. Touch shared files minimally and additively. When something is not covered by the spec or a D-id, pick the option most consistent with P1/P2, the spec and the D-ids, implement it, and record it in GAPS.md under your ticket as "Decided in T<n>: …" (the maintainer is not available; do not stop to ask).
4. Run `pnpm check` until it is green. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge feature/290_journey and run `pnpm check` again.
6. Write tickets/<N>.md (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria. Commit it on your branch.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
