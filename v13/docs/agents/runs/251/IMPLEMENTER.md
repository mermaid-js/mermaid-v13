# Implementer brief: spec #251 (core fixes found by the M3 ports)

- Spec: `gh issue view -R mermaid-js/mermaid-v13 251`. Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS,MIGRATION}.md. Recipe and pitfalls: v13/docs/agents/port-diagram/ (README, pitfalls, parser-method).
- Notes: this folder. Read GAPS.md and close the items listed for your ticket.
- Integration branch: `feature/251_core-fixes`.
- Worktree: /Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N> on the branch named in your brief. Use absolute paths; stay out of the main checkout and other worktrees. Run `pnpm install --frozen-lockfile` first.
- This is shared core: every fix can change output for every diagram type. The v12 reference is 12.2.0 through the conformance oracle (`packages/conformance/src/oracle.ts`, the `mermaid-v12` dev dependency). Ask the oracle; don't reason about v12.
- Shared machine: one full `pnpm check` and one Playwright e2e run at a time. Run `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-check.lock pnpm check` and `lockf /Users/knsv/repos/mermaid-v13/.tmp/m3-e2e.lock <e2e command>`. A timing test that fails under load is not a regression; rerun it under the lock before acting on it.
- E2E runs in CI's image only (no hosted CI): copy the tree under `<worktree>/.tmp/`, then `docker run --rm -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.62.1-noble` with `corepack enable`. Run the e2e specs your change touches; the final full run is done once at the end.

1. Confirm your base: `git merge-base --is-ancestor feature/251_core-fixes HEAD`. If that fails, `git reset --hard feature/251_core-fixes`.
2. Use the Skill tool with `mattpocock-skills:tdd`. Write the failing test first (v12 oracle check where one applies), then fix.
3. Stay in the ticket's scope. Touch shared files minimally. Generated files come from `gen:*` scripts; never hand-edit them. Any output change beyond what the ticket names is a regression until shown otherwise: list every changed snapshot/golden with why. A deliberate difference from v12 needs a D-id and a MIGRATION.md row: stop and report it instead of inventing one.
4. Run `pnpm check` until green. Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge feature/251_core-fixes into your branch and run `pnpm check` again.
6. Write tickets/<N>.md (≤ 40 lines): what changed (file:line), the oracle verdicts, every changed snapshot/golden, unmet criteria. Commit it on your branch.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
