- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #414. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (D330–D339, D540, D541, D543). Recipe for theme work: v13/docs/agents/port-diagram/theming.md.
- Notes: this folder. Read INDEX.md, CONTRACT.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Worktree: .claude/worktrees/t<N> on feature/<N>_<short>, cut from `feature/414_theme-t0`. Use absolute paths, and stay out of the main checkout and other worktrees. Run `pnpm install` first.
- Env: `export PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH; unset PARSE_FIXTURE_PATH` before `pnpm check`.
1. Confirm your base: `git merge-base --is-ancestor feature/414_theme-t0 HEAD`. If that fails, reset onto it.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` or `createTheme(spec, { diagram })`.
3. **Identity gate (D339).** Before any change, `pnpm --filter @mermaid-js/bench theme-identity --out <scratch>/base.json`; after, `--out <scratch>/head.json --compare <scratch>/base.json`. 0 differing, apart from D333's listed entries (pass them with `--allow`). Never update a snapshot to make it pass: fix the change or split it.
4. Report core gz before and after: `packages/bench/src/core-size.spec.ts` (bench measure) and `packages/mermaid/src/cdn-build.spec.ts` (CDN measure). Budget 94,208 B (D338).
5. Stay in the ticket's scope. Regenerate generated files (`pnpm gen:theme`, `pnpm gen:config`), never hand-merge them. Escalate decisions instead of making them.
6. Run `pnpm check` until it is green. Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
7. Before reporting, merge `feature/414_theme-t0` and run `pnpm check` again.
8. Write tickets/<N>.md (≤ 40 lines): what moved, how, gz before/after, identity result, unmet criteria.
9. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
