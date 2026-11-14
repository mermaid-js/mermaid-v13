# Implementer brief (spec #795, classic-theme parity under overrides)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #795 (its five maintainer decisions are settled on the recommended option; see the comment on #795). **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md` (R-THEME-1, -3, -4, -5, -6, -9; D117, D151, D152, D331, D333, D351, D415). **Recipe:** `v13/docs/agents/port-diagram/theming.md`, `shared-files.md`. Root `AGENTS.md` has the rules for every change.
- **Notes:** this folder. Read `INDEX.md` (pointers and ticket table), `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on the ticket's branch (`INDEX.md`). Work only there, with absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- **Base:** the integration branch `feature/795_classic-theme-parity`. Confirm with `git merge-base --is-ancestor feature/795_classic-theme-parity HEAD`; if that fails, reset onto it.
- **Repo rules:** pnpm; no TS enums; no console in shipped packages. Issue sources are `.mmd` fixtures under `e2e/diagrams/<type>/`, never strings in a spec. Never hand-edit generated files (`theme-variables.md`, `MIGRATION.md`, `config-reference.md`, `*/generated/*`); run `pnpm regen` after changing an input, and on a generated-file conflict take theirs and regen. `generated/` folders are gitignored: add new generated files with `git add -f`. Never edit `.github/workflows/*`, never loosen a gate, never `--no-verify`. No AI attribution in commits or files (no Co-Authored-By, no "Generated with").
- **Issue references:** "Part of #N" in commit messages, never a closing keyword (`Fixes`, `Closes`, `Resolves`).
- **Environment:** Node and pnpm from Volta. Run tests with `env -u PARSE_FIXTURE_PATH VITEST_MAX_WORKERS=4`. The machine runs many agents: run vitest on the packages you touch, not the whole repo.
- **Core size (core tickets T0–T2):** measure with `packages/bench/src/core-size.spec.ts` before and after; the limit is in `packages/mermaid/size-budget.json` (99,328 B gz). If you would exceed it, you may raise the budget up to 102,400 B rather than block; say so under "Deviations".
- **Decisions:** a choice the spec, ticket or a D-id does not cover: take the option most consistent with them, implement it, and report it under "Deviations". A choice that contradicts DESIGN, a D-id or a v12 default: stop and report it as a question instead.

## Steps

1. Confirm the base (see **Base**).
2. Work test-first: a failing test, then the code that makes it pass. Test through `createMermaid().render()` or `createTheme`, except where the ticket names another seam.
3. Stay within the ticket's scope. Touch shared files minimally and additively.
4. Scoped checks must pass: vitest for each package you touch, `packages/conformance`, `pnpm typecheck`, and `pnpm lint` (eslint) on the files you changed. If you changed a generated-file input, also `pnpm regen` and the generated check (`tsx tools/workspace/check-generated-cli.ts`). Commit. Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge `feature/795_classic-theme-parity` again and rerun the scoped checks.
6. Write `v13/docs/agents/runs/795/tickets/<N>.md` (≤ 40 lines) in your worktree, committed on your branch: what changed, how to use it, test helpers, core gz size before/after (core tickets), decisions, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks run, deviations, unmet criteria.
