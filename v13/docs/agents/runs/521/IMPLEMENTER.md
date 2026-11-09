# Implementer brief: block port (#521)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #521 (`gh issue view -R mermaid-js/mermaid-v13 521`), decided D440–D449 (`v13/docs/DECISIONS.md`). Docs: `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md`. Recipe: `v13/docs/agents/port-diagram/` (README, parser-method, theming, language, pitfalls). Theme contract: `v13/docs/agents/runs/414/CONTRACT.md`.
- Tickets: T0 #552 (core, own PR), T1 #553, T2 #554, T3 #555, T4 #556, T6 #557, T5 #558, T7 #559.
- Notes: this folder. Read INDEX.md (pointer notes on v12 block and v13 references), GAPS.md (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- v12 source: `git show fa796a943:packages/mermaid/src/diagrams/block/…`; v12 config schema `git show fa796a943:packages/mermaid/src/schemas/config.schema.yaml`. Oracle: `mermaid@12.2.0` in `packages/conformance` (D316); jison lexer oracle `loadJisonLexerOracle('block')`. Pele (`/Users/knsv/repos/pele/src/diagrams/block/`) is an MIT reference, never the oracle (D325).
- Worked examples: kanban, cynefin, pie (jison types); treemap, wardley, xychart, sankey, venn (newest ports).
- Worktree: `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` (under the main checkout, never nested inside another worktree: knip scans nested ones) on `feature/<N>_<short>`, cut from `feature/521_block`. Use absolute paths; stay out of other worktrees. Run `pnpm install` first.
- Env: `export PATH=$HOME/.volta/tools/image/node/24.16.0/bin:$PATH VITEST_MAX_WORKERS=4 GIT_SSH_COMMAND="ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30"`. Run every `pnpm check` and `pnpm e2e` as `env -u PARSE_FIXTURE_PATH lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` (three ports share this machine; a set `PARSE_FIXTURE_PATH` makes the conformance corpus specs read an outside folder and fail). Ticket agents never push.

1. Confirm your base: `git merge-base --is-ancestor feature/521_block HEAD`. If that fails, reset onto `feature/521_block`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()`, except where the recipe step names another seam (T0–T3 have their own).
3. Stay in the ticket's scope. Touch shared files minimally and additively (registry, `JISON_TYPES`, `HARVESTS`, knip, vocab lists, goldens). Test sources go in `.mmd` fixtures under `e2e/diagrams/block/`; failing or lexer-only inputs in `packages/conformance/corpus/block-cases.json`; never TS corpus arrays. Generated files under `generated/` are gitignored: `git add -f`. After adding a package run `pnpm install`.
4. Shared theme code never names a diagram-only variable; a diagram never names a theme (D331, D152). Block has no theme table (spec): it reads shared core rows only.
5. Where the spec and D-ids are silent, pick the option most consistent with them and record it in GAPS.md (do not wait for answers). Flag visible rendering changes as needing a D-id.
6. Run `pnpm check` until it is green. Commit with no AI attribution (no Co-authored-by, no "Generated with"). Never `--no-verify`. Don't push, open PRs, or comment on or close issues. Never edit `.github/workflows/*` or loosen a gate.
7. Before reporting, merge `feature/521_block` and run `pnpm check` again.
8. Write `tickets/<N>.md` (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria.
9. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
