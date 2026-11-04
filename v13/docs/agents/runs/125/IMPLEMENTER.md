# Implementer brief (spec #125, M3 sequence diagram port)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #125. **Docs:** `v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md`. **Recipe:** `v13/docs/agents/port-diagram/` (README, parser-method, pitfalls, theming). D112 (all four M3 types in parallel) is recorded at commit `8672377c3`; the spec body summarises it.
- **Notes:** this folder. Read `INDEX.md`, `01-v12-sequence.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Repo rules:** CLAUDE.md. pnpm; no TS enums; no console in shipped packages. The new package imports only `@mermaid-js/core` subpaths, never another diagram package.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_<short>`. Work only there with absolute paths; stay out of other worktrees. Run `pnpm install` first.
- **Integration branch:** `feature/125_sequence-diagram`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/upbeat-franklin-e740aa`. Read only from it; never write there.
- **Parallel M3 specs (D112):** ER, class and state are being ported at the same time on their own branches. Never hand-edit generated shared files (registry, parity suites, config reference, theme variables) beyond what `gen:*` produces; keep additions to shared files (conformance registry, root scripts) minimal and additive.
- **Hosted CI is off.** Verify locally. The user is remote: never hard-code hostnames.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/125_sequence-diagram HEAD`. If that fails, `git reset --hard feature/125_sequence-diagram`.
2. Use the Skill tool with `tdd`. Test through `createMermaid().render()` / `renderSync()`, except where the recipe step names its own seam (lexer parity, layout invariants).
3. Stay within the ticket's scope. If a choice contradicts DESIGN, REQUIREMENTS, a D-id or a v12 default/semantics, stop and say so in your reply instead of deciding it. Implement the documented behaviour meanwhile.
4. `pnpm check` must pass, and `packages/conformance` specs (pitfall 26). Commit with no AI attribution (no Co-Authored-By, no "Generated with"). Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/125_sequence-diagram` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in **your own worktree** at `v13/docs/agents/runs/125/tickets/<N>.md`, committed on your branch. It covers: exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
