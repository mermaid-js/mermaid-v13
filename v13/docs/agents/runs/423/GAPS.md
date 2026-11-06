# Gaps (spec #423)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Cynefin needs no core change of its own (it relies on #414's T0a) and has no ASCII output (D320).
- **Skeleton and model first.** The orchestrator landed the package skeleton and `CynefinModel` before T1 and T3 started, so the two run in parallel (as pie's `PieModel`).
- **Pele is not available on this machine.** Its fuzz fragment list (51 fragments, `tests/cynefin/oracle.test.ts`) and probe scripts (`scratchpad/specs/cynefin/probe/`) are not here; T2 builds its own fragment list from the spec's quirks.

## #461 T1 lexer

## #465 T2 parser

## #467 T3 layout

## #468 T4 renderer

## #469 T5 integration

## #470 T6 language facet
