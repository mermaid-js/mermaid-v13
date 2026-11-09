# Gaps (spec #528)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #593 T0a engine skeleton
- **Choice:** empty lanes get a band of their own in source order (v12 shrinks them to 0×0, which `validateLayout` rejects).
- **Choice:** a nested group grows by its own padding on each side (v12 split one padding between both sides); `nestedGroupSizing` expects twice the padding.
- Fix per D536: RL keeps the title band on the left and BT on top (v12 flipped them to right and bottom); the band grows with a taller measured title.
- `PEER_LAYOUTS = {'swimlane'}` exempts swimlane from D285 for every diagram, mindmap included (D535, D327). Compass (#590) adds `'compass'` to the same set.
- Not ported: v12's "one definition of a lane" source scan (core specs have no Node file APIs); shared-node lint (one `parent` per node in `LayoutGraph`; T2's warning comes from flowchart's model).

## #595 T0b router and post-processing
- From T0a review: a labelled self-loop's label node sits beside its source, detached from the placeholder loop. The router must route self-loops through their label.

## #596 T0c line hops

## #597 T1 registration

## #598 T2 lane drawing
- Open: since #589 (block T0) flowchart has no theme table (`packages/diagram-flowchart/src/theme/` is gone; its shape rows are core rows). Lanes need no new variables per the spec (they read `clusterBkg`/`clusterBorder` and flowchart's existing per-subgraph palette). If T2 finds it needs a lane-only row, where it lives (flowchart's own table, recreated, versus core) is a choice the spec doesn't settle: record it here as **Choice** and follow `theming.md` as it stands after #589.

## #601 T3 integration

## #603 T4 ascii
