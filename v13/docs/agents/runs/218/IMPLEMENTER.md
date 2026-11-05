# Implementer brief — spec #218 (M3.5 plugin-loading platform)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: `gh issue view -R mermaid-js/mermaid-v13 218`. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D160–D169 in the M3.5 section at the end of DECISIONS). This is not a diagram port: no parser/oracle steps.
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Integration branch: `feature/218_plugin-platform` (worktree `/Users/knsv/repos/mermaid-v13/.claude/worktrees/m35-platform-impl-d51ccd`). Your worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Use absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Constraints: `core` and `diagram-*` gain no Node imports (R-ARCH-1); DESIGN §2 dependency directions hold; `mermaid`'s dependencies stay first-party only (`check:deps`). Shared generated files (registry, config reference, schema) are regenerated with the `gen:*` scripts, never hand-merged (D112). Don't edit `.github/workflows/*`. Don't add root package.json scripts (ask in your reply). New D-ids only in D160–D169 and only via the coordinator: escalate instead. Sizes in specs come from `packages/mermaid/size-budget.json`, never hard-coded.

1. Confirm your base: `git merge-base --is-ancestor feature/218_plugin-platform HEAD`. If that fails, reset onto feature/218_plugin-platform.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `registerExternalDiagrams()` / `detectType()`, or the e2e harness for install/bundler/CDN behaviour.
3. Stay in the ticket's scope. Touch shared files minimally and additively. Escalate decisions (anything contradicting DESIGN, REQUIREMENTS or a D-id) in your reply instead of making them.
4. Run `pnpm check` until it is green. Machine-wide, only one full check and one e2e run at a time: `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` and `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock pnpm e2e` (or a narrower `pnpm exec playwright test <spec>` under the same lock while iterating). A timing test that fails under load is not a regression; rerun it under the lock. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge `feature/218_plugin-platform` and run `pnpm check` again.
6. Write `v13/docs/agents/runs/218/tickets/<N>.md` in your branch (≤ 40 lines): exports, how to use them, test helpers, gz sizes, unmet criteria. Commit it.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
