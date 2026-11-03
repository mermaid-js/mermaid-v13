# Implementer brief (spec #55, v13 dev server)

- **Ticket:** `gh issue view -R mermaid-js/mermaid-v13 <N>`. **Spec:** #55.
- **Notes:** this folder. Read `01-v12-dev-server.md`, `GAPS.md` (close the items listed for your ticket) and `tickets/<dep>.md` for each blocker.
- **Process:** `v13/docs/agents/port-diagram/orchestration.md` covers the general rules.
- **Repo rules:** CLAUDE.md. Use pnpm, no TS enums and no console in shipped packages. `packages/dev` is a private dev tool, but it still uses `consistent-type-imports` and cspell.
- **Worktree:** `/Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N>` on `feature/<N>_dev`. Work only there, using absolute paths. Run `pnpm install` first.
- **Integration branch:** `feature/55_dev-server`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/int55`. Read only from it; never write there.
- **The user is remote:** start servers on a port and check them with curl or agent-browser on localhost. Never hard-code hostnames in the repo.

## Steps

1. Confirm the base: `git merge-base --is-ancestor feature/55_dev-server HEAD`. If that fails, `git reset --hard feature/55_dev-server`.
2. Use the Skill tool with `tdd`. Server behaviour is tested with node specs at the HTTP seam; browser behaviour with Playwright specs under `e2e/dev/`.
3. Stay within the ticket's scope. If a choice contradicts spec #55 or a v12 behaviour the spec says to keep, stop and say so in your reply instead of deciding it yourself.
4. `pnpm check` must pass, plus the ticket's Playwright specs. Commit with no AI attribution. Don't push, open PRs, or comment on or close issues.
5. Before reporting, `git merge feature/55_dev-server` and run the checks again.
6. Write `tickets/<N>.md` (≤ 40 lines) in the **int55** worktree's `v13/docs/agents/runs/55/`. It covers: exports, routes and components, how to extend them, test helpers, and unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
