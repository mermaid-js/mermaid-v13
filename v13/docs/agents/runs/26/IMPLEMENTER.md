# Implementer instructions (M2.5 tickets)

- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>` (always pass -R). Spec: #26. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md (DESIGN §4.5, D88–D99, R-LANG-*). Repo rules: CLAUDE.md.
- Notes: this folder (v13/docs/agents/runs/26/). Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Worktree: /Users/knsv/repos/mermaid-v13/.claude/worktrees/t<N> on branch feature/<N>_<short>. Use absolute paths; never touch the main checkout /Users/knsv/repos/mermaid-v13 or other worktrees. Run `pnpm install` first.
- Integration branch: feature/26_language-service.

Steps
1. Confirm base: `git merge-base --is-ancestor feature/26_language-service HEAD`; if not, `git reset --hard feature/26_language-service`.
2. Use the Skill tool with `tdd` and build the ticket test-first. Test through the highest seam the ticket names (spec #26 "Testing Decisions"): the service API for service features, `parse()` for kit/parser work, the reader API for YAML, the generator for gen-grammar. Corpus = e2e/diagrams/**/*.mmd.
3. Stay in the ticket's scope. Other tickets run in parallel; touch shared files (core package.json exports, core index, root config) minimally and additively. Escalate any choice that contradicts DESIGN, a D-id or a v12 default instead of making it.
4. `pnpm check` must pass (known local-only failures: cli.spec on Node 26, dev/server.spec IPv4; name them if you see them). Commit in logical commits with NO AI attribution (no Co-Authored-By, no "Generated with"). Do not push, open PRs, or comment on/close issues.
5. Before reporting: `git merge feature/26_language-service`, resolve conflicts, re-run `pnpm check`.
6. Write tickets/<N>.md here (≤ 40 lines): exports, how to use them, test helpers, gz size delta, unmet criteria. Commit it on your branch.
7. Reply in ≤ 12 lines: branch, head sha, checks run and result, deviations, unmet criteria.
