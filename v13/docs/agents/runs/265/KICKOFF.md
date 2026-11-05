# Kickoff — spec #265 on the reference machine

Paste the block below into a Claude Code session started in the repo on the reference machine. It starts one ticket. Paste it again for the next one after the previous ticket's PR is up.

```text
Implement the next unblocked ticket of spec #265 (render speed) in mermaid-js/mermaid-v13.
This machine is the reference machine for the spec's timing (D208), so run one ticket at a
time and take the binding A/B only while nothing else is running here.

1. git fetch mermaid-js. Read the brief and the index, from the docs branch until its PR merges:
   git show mermaid-js/docs/265_render-speed-spec:v13/docs/agents/runs/265/IMPLEMENTER.md
   git show mermaid-js/docs/265_render-speed-spec:v13/docs/agents/runs/265/INDEX.md
   (after the merge they are in v13/docs/agents/runs/265/ on mermaid-v13).
2. Pick the first ticket in this order that is open, unassigned and has no open blocker:
   #271 (T0), #272 (T1), #273 (T2), #278 (T7). Stop and tell me if none qualifies; the
   remaining tickets wait for the M3.5 integration PRs. A ticket whose only open blocker is
   the ticket you just finished may start from that ticket's branch.
3. Read the ticket (gh issue view -R mermaid-js/mermaid-v13 <N>) and spec #265, assign the
   ticket to me, and follow IMPLEMENTER.md exactly.
4. T0 and T1 each get their own draft PR into mermaid-v13. From T2 on, branch from
   feature/265_render-speed; create that branch from the tip of T1's branch if it does not
   exist, with a draft integration PR into mermaid-v13 that stays a draft.
5. Rules that this machine's memory may not have: no AI attribution in commits or PRs; push
   only to the mermaid-js remote; open PRs as drafts and run gh pr ready on a ticket PR once
   it is done (criteria met, CI green, mergeable), since ready is what marks it for review;
   the integration PR stays a draft until INDEX.md's finish rule holds; never merge; never
   edit .github/workflows; always pass -R mermaid-js/mermaid-v13 to gh.
6. Finish with the reply IMPLEMENTER.md asks for, and stop. Do not start the next ticket.
```
