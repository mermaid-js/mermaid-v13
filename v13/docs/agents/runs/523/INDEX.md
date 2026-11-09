# Run notes, spec #523 (M5b agentflow, `@mermaid-js/diagram-agentflow`)

Integration branch `feature/523_agentflow` (from `mermaid-v13` at 521fb76ee). Draft PR: #632.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate and corpus | #544 | #285 (merged) | merged (no-ff, head 047a81af7; main entry 7,778 B gz, core untouched) |
| T2 grammar, parser, model, AST | #546 | #544 | merged (ff 5b739cebe; main entry 23,846 B gz before review fixes, core untouched) |
| T3 layout | #547 | #546 | open |
| T4 SVG renderer | #548 | #547, block's shape-geometry T0 (#521) | open |
| T6 language facet | #549 | #546 | open |
| T5 integration | #550 | #548, #549 | open |
| T7 ASCII renderer (optional, D320) | #551 | #550 | open |

Core size at the base: 93,891 B gz (`measureCoreSize`, gate 98,304 B, D546). One ticket agent at a time (three ports share AI-Max).

## PAUSED (2026-11-09, maintainer's decision: AI-Max overloaded)

Resume only on the coordinator's "RESUME". Nothing of this port is running or queued.

- **Integration** `feature/523_agentflow` (worktree `.claude/worktrees/523-agentflow-94bbb0`): remote 9e1e69420. Three local docs commits are not pushed: 6d3787cf1 (scoped handoff checks in IMPLEMENTER.md), 506def60c (D468 amendment) and this pause note. Draft PR #632. T1 (#544) and T2 (#546) merged.
- **T3 (#547)** `feature/547_agentflow-layout` (worktree `.claude/worktrees/t547`), head 609401fd9, clean, not merged. The review fixes (items 1–9: frame ends on the frame border, edges checked against v12 `getData()`, rule fixtures under ELK, `AGENTFLOW_CONFIG_INVALID`, `CurveKind`, `xy()`/`MIN_SLANT`, shape geometry bundled, naming) are all committed. Scoped checks pass on 609401fd9. **Left:** the full `pnpm check` under the lock (the ticket touched core and `tools/*`), then refresh the Checks line in `tickets/547.md`; spot-check the frame-end fix; merge into the integration branch (--no-ff: the branch has 506def60c but not the pause note); merge `mermaid-v13`; push (pre-push runs the full check, which can stand in for the ticket's).
- **Next after T3:** T4 (#548, renderer; block T0 #589 is in), then T6 (#549), T5 (#550), T7 (#551, optional). Worktrees go under the main checkout's `.claude/worktrees/`.

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, `mermaid-v13` is merged in, and `pnpm check`, `pnpm e2e` and hosted CI are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the issues to close.

- `01-v12-agentflow.md`: pointer notes on v12's jison grammar (diff against flowchart), DB, diagnostics, shapes, colour slots, renderer, config schema, specs, in-tree fixtures, the e2e corpus.
- `02-v13-seams.md`: pointer notes on what the port plugs into: flowchart's parser, layout, shapes and facet, the jison oracle and parity wiring, gen:grammar, registry, config, theme, size gates.
- `IMPLEMENTER.md`, `GAPS.md`, `tickets/`: as in other runs.
