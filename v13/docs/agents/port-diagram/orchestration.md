# Orchestrating a port spec with agents

This file is for runs where one orchestrating session implements a whole v13 spec with one agent per ticket. It records what M1 taught about such runs (`v13/docs/retros/M1.md`).

## Where things live

- **Repo:** `mermaid-js/mermaid-v13`, the `mermaid-js` git remote. It is private. Push only there, never to `upstream` (the public `mermaid-js/mermaid`). Pass `-R mermaid-js/mermaid-v13` to every `gh` call.
- **Integration branch:** `feature/<spec#>_<short>`, cut from `mermaid-v13`. After the first merge, push it and open a **draft PR into `mermaid-v13`**. Every later merge updates that PR.
- **Run notes:** `v13/docs/agents/runs/<spec#>/`. Exploration notes, `IMPLEMENTER.md`, `GAPS.md` and `tickets/<n>.md` handoffs all live here, in the repo, so the next session can read them. Commit them with the integration branch.

## Setup

1. Read the spec and tickets. Draw the frontier from the native blocked-by links.
2. Spawn an exploration agent that writes pointer notes, with file:line references and nothing pasted, into the run notes. It covers the type's v12 grammar, DB, renderer, specs and fixture counts.
3. Write `IMPLEMENTER.md` (template below) and an empty `GAPS.md`.
4. Make worktrees by hand: `git worktree add .claude/worktrees/t<n> -b feature/<n>_<short> <integration>`. The repo's WorktreeCreate hook can fail in agent sessions.

## Per ticket

- The brief is three lines: the ticket number, a pointer to `IMPLEMENTER.md`, and any ticket-specific pointers. Point to things instead of repeating them.
- When a handoff arrives:
  1. Spot-check one or two claimed acceptance criteria yourself, against the code or a test run. Handoff claims are unverified until checked.
  2. Review the ticket's diff if it is non-trivial. Send any findings back to the same agent.
  3. Merge with `--ff-only` if the branch has the integration tip. Otherwise use a merger agent (`--no-ff`, `pnpm check` after the merge, fix only merge breakage).
  4. Move the ticket's unmet criteria into `GAPS.md` under the ticket that owns each one.
  6. Push the integration branch.
- After every merge, check the frontier. Start each newly unblocked ticket right away, in its own worktree.
- Only one merge runs at a time in the main checkout.

## Collisions between parallel tickets

- **Shared contracts.** A ticket that owns a shared type or helper lands it first. If it can't, it announces the contract in `GAPS.md` and every consumer adopts it. When a contract merges, message the agents still running.
- **Deprecate, don't delete.** A helper that live tickets depend on gets deprecated. It is removed only after every consumer has merged.
- **Decisions.** When a handoff reports a choice that contradicts DESIGN, a D-id or a v12 default, ask the maintainer before merging it. Record the answer as a D-id.

## Finish

1. Read GitHub CI on the draft PR. It covers WebKit, Argos and the full matrix, none of which run locally. A red job is a ticket that isn't done.
2. Review the whole integration branch once more, focused on how the tickets fit together. Fix the findings with a single implementer agent.
3. Remove the worktrees after checking that each one is clean and merged.
4. Closing issues is usually denied in agent sessions. Give the maintainer the `gh issue close` commands instead.

## IMPLEMENTER.md template

```markdown
- Ticket: `gh issue view -R mermaid-js/mermaid-v13 <N>`. Spec: #<spec>. Docs: v13/docs/{DESIGN,REQUIREMENTS,DECISIONS}.md. Recipe: v13/docs/agents/port-diagram/.
- Notes: this folder. Read INDEX.md, GAPS.md (close the items listed for your ticket) and tickets/<dep>.md for each blocker.
- Worktree: .claude/worktrees/t<N> on feature/<N>_<short>. Use absolute paths, and stay out of the main checkout and other worktrees. Run `pnpm install` first.
1. Confirm your base: `git merge-base --is-ancestor <integration> HEAD`. If that fails, reset onto <integration>.
2. Work test-first: write a failing test, then the code that makes it pass. Test through `createMermaid().render()`, except where the recipe step names another seam.
3. Stay in the ticket's scope. Touch shared files minimally and additively. Escalate decisions instead of making them.
4. Run `pnpm check` until it is green. Don't push, open PRs, or comment on or close issues.
5. Before reporting, merge <integration> and run `pnpm check` again.
6. Write tickets/<N>.md (≤ 40 lines): exports, how to use them, test helpers, gz size, unmet criteria.
7. Reply in ≤ 12 lines: branch, head sha, checks, deviations, unmet criteria.
```
