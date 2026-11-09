# Gaps (spec #528)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #593 T0a engine skeleton

## #595 T0b router and post-processing

## #596 T0c line hops

## #597 T1 registration

## #598 T2 lane drawing
- Open: since #589 (block T0) flowchart has no theme table (`packages/diagram-flowchart/src/theme/` is gone; its shape rows are core rows). Lanes need no new variables per the spec (they read `clusterBkg`/`clusterBorder` and flowchart's existing per-subgraph palette). If T2 finds it needs a lane-only row, where it lives (flowchart's own table, recreated, versus core) is a choice the spec doesn't settle: record it here as **Choice** and follow `theming.md` as it stands after #589.

## #601 T3 integration

## #603 T4 ascii
