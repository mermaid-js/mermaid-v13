# Run notes, spec #528 (M5b swimlane layout engine, flowchart `swimlane-beta`)

Integration branch `feature/528_swimlane` (from `mermaid-v13` at 521fb76ee). Draft PR: #651.

T0a, T0b and T0c land as their own PRs into `mermaid-v13` (spec: reviewed apart from flowchart). The integration branch merges each T0 branch so T1+ can build on them, and re-merges `mermaid-v13` once they land.

| Ticket | Issue | Branch | Blocked by | State |
| --- | --- | --- | --- | --- |
| T0a engine skeleton, lane rules, phases through coordinates | #593 | `feature/593_swimlane-engine` (own PR #628) | — | PR #628 merged into `mermaid-v13` (e540d3eb7); merged here. Core 94,352 → 94,385 B gz, chunk 15,316 B gz |
| T0b orthogonal router, post-processing, DDLT gates | #595 | `feature/595_swimlane-router` (own PR #639) | #593 | PR #639 merged into `mermaid-v13` (76f2e0ad1); #634 and #636 pinned, no D-id yet |
| T0c shared line hops, lazy core chunk (closes #78) | #596 | `feature/596_line-hops` (own PR) | — | PR #646 ready (ddd32b7a2; core 94,412 → 94,541 B gz, hops +103, swimlane section defaults +26) |
| T1 flowchart registration and config section | #597 | `feature/597_swimlane-registration` | #593, #595 | merged (ff f6928a06b; core 95,929 → 96,254 B gz, +325: section layering and directive routing) |
| T2 lane drawing, palette, warnings | #598 | `feature/598_swimlane-lanes` | #597 | merged (f3157a61d; core 96,317 B gz with `mermaid-v13` at 8b336e2b0, T2 itself a few bytes) |
| T3 integration | #601 | `feature/601_swimlane-integration` | #598, #596 | merged (ff a07c9751f; core 96,500 B, loaded stand-in 132,090 B on base b1af2c224) |
| T4 ascii | #603 | `feature/603_swimlane-ascii` | #597 | merged (c4b93590b; 0 B core; ascii corpus in both charsets) |

One ticket agent at a time (wave 4 shares this machine). Merge-order note from the wave 4 coordinator: architecture's compass T0 (D502) is meant to land first; whichever of it and T0a lands second re-merges `mermaid-v13` and keeps both `LAZY_LAYOUTS` rows. The D285 exemption set is one set: compass names it `ANY_GRAPH_LAYOUTS`, T0a `PEER_LAYOUTS`; the PR that lands second adopts the first one's name and adds its row (`'swimlane' // D535`).

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close (#528's tickets, #78).

- `01-v12-engine.md`: pointer notes on v12's swimlane engine at upstream `c9b12739f` and its specs and fixtures.
- `IMPLEMENTER.md`, `GAPS.md`, `tickets/`: as in other runs.
