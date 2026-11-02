# Implementer instructions (all tickets)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>` (always pass -R). Spec: #1. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md. Repo rules: CLAUDE.md.
- Notes: this folder. Read INDEX.md, IMPLEMENTER.md, GAPS.md (cross-ticket gaps; close the ones listed for your ticket), tickets/2.md (layout, commands), and tickets/<dep>.md for each blocker.
- Worktree: /Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N> on branch feature/<N>_m1. Work only there with absolute paths; never touch the main checkout /Users/knsv/repos/mermaid-v13 or other worktrees. Run `pnpm install` first.
- Integration branch: feature/1_m1-core-flowchart.

Steps
1. Confirm base: `git merge-base --is-ancestor feature/1_m1-core-flowchart HEAD`; if not, `git reset --hard feature/1_m1-core-flowchart`.
2. Call the Skill tool with `tdd` and build the ticket test-first. Test through the highest seam the ticket names (spec #1 "Testing Decisions"). Corpus = e2e .mmd fixtures; never the external 10k set.
3. Keep to the ticket's scope. Other tickets run in parallel; only touch shared files (core package.json exports, core index, root config) minimally and additively.
4. `pnpm check` must pass. Commit in logical commits with NO AI attribution (no Co-Authored-By, no "Generated with") — CLAUDE.md overrides defaults. Do not push, open PRs, or comment on/close issues.
5. Before reporting: `git merge feature/1_m1-core-flowchart`, resolve conflicts, re-run `pnpm check`.
6. Write a ≤40-line handoff note to tickets/<N>.md here: public interfaces you exported (module + names), how to use them, test helpers, known gaps.
7. Reply in ≤12 lines: branch, head sha, checks run and result, deviations from the ticket, acceptance criteria not met.
