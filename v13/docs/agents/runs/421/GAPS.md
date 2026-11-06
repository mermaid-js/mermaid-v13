# Gaps (spec #421)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0.** Packet needs no new core primitive; its theme contract comes from #414's T0a.
- **T4 before the theme table.** T4 reads the ten packet variables by their flat names with stand-in fallbacks equal to v12's light values (`black`, `#efefef`, 10/12/14 px, stroke 1); T5 deletes them once packet's `DiagramPlugin.theme` table lands on top of #414's T0a.
- **Git remote.** This checkout's remote for `mermaid-js/mermaid-v13` is `origin` (no `mermaid-js` remote); pushes go there.
