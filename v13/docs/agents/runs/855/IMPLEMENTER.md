# Implementer brief (spec #855, function complexity)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** `gh issue view -R mermaid-js/mermaid-v13 855`; its "Rules for every ticket" and "Testing Decisions" bind you. **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md`. Root `AGENTS.md` has the rules for every change.
- **Notes:** this folder. Read `INDEX.md` (pointers, check commands, ticket table), `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on the ticket's branch (`INDEX.md`). Work only there, with absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install` first.
- **Base:** the integration branch `feature/855_complexity`. Confirm with `git merge-base --is-ancestor feature/855_complexity HEAD`; if that fails, reset onto it.
- **Environment:** Node 24.16.0: prefix commands with `volta run --node 24.16.0`. Run vitest with `env -u PARSE_FIXTURE_PATH VITEST_MAX_WORKERS=2`. The machine runs many agents: never run `pnpm check`, `pnpm test` or `pnpm e2e` whole; the orchestrator runs the full gate, one ticket at a time.
- **This is a refactor.** No output change: SVG and text output byte-identical, `LayoutModel` values equal, same diagnostics and messages in the same order. No algorithm change. Existing specs pass unchanged: do not edit an existing spec or snapshot to make it pass (moving an import that a split forces is fine; say so).
- **The score is `eslint-suppressions.json`.** Remove the entries your ticket names (and `no-param-reassign` entries the split frees). Add none, in the file or as a disable comment. Do not touch entries for files outside your ticket; on a merge conflict in that file keep both sides' removals.
- **Speed.** A split that costs speed is not taken: that function stays whole and keeps its entry. Do not assert or report timings from this machine; hand over the bench command from `INDEX.md` instead. Keep hot loops free of new allocations (no per-call closures, records or arrays where there were locals); the D583 scratch buffers keep their frame rule.
- **Size.** Core and loaded gz stay within `packages/mermaid/size-budget.json`. Never change a limit. If you would exceed one, stop and report.
- **Ported files.** A file split from a port of the reference implementation carries the reference implementation's header and the reference implementation's commit it was split from (R-REL-4, D66; `INDEX.md` has the lines).
- **Repo rules:** pnpm; no enums; no `console`, DOM, `node:` or clock in `core` and `diagram-*`; import boundaries; never hand-edit generated files; never edit `.github/workflows/*`; never loosen a gate; no `--no-verify`. No AI attribution in commits or files (no Co-Authored-By, no "Generated with"). "Part of #N" in commit messages, never a closing keyword.
- **Decisions:** a choice the spec, ticket or a D-id does not cover: take the option most consistent with them and report it under "Deviations". A choice that contradicts DESIGN, REQUIREMENTS, a D-id or a v12 default: stop and report it as a question.

## Steps

1. Confirm the base (see **Base**).
2. Record the state before: the entries for your files in `eslint-suppressions.json`, core gz, and the byte-identity baseline (`INDEX.md`).
3. Work in small commits, one function or phase each, so a bisect lands on one move. The existing specs are the test; add a spec only where the ticket asks for one (X5's differential spec) or where a split-out function has no coverage.
4. Scoped checks must pass: vitest for each package you touch, the conformance and parity specs `INDEX.md` lists for your ticket, `tsc --noEmit` for those packages, `eslint` on the files you changed, `pnpm lint` (eslint, prettier, cspell), `pnpm lint:knip`, `pnpm check:licenses`, `pnpm exec fallow audit --base feature/855_complexity --quiet` (CI runs it; moved code reads as new there), the byte-identity check against the base digests and the core-size spec. Commit. Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge `feature/855_complexity` again and rerun the scoped checks.
6. Write `v13/docs/agents/runs/855/tickets/<N>.md` (≤ 40 lines) on your branch: what moved where, entries before and after per rule, core gz before and after, the bench command, functions kept whole and why, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks run with results, entries removed, deviations, unmet criteria.
