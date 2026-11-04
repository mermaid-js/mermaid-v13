# Gaps — spec #127

Unmet criteria and shared contracts, by owning ticket.

## Held (blocked outside this spec)

- #142 T2, and everything after it (#144, #146, #148, #151): #27 and #28 are not merged into `mermaid-v13` yet (D107). #151 also waits on #29 and #31.

## #144 T3 layout (from #140, `v13/docs/research/state-regions.md`)

- Adopt the nested-group model: each region a title-less `LayoutGroup` in its composite, no edges between regions. No state T0 (D111).
- The builder stretches every region frame along the flow to the composite's inner size, so dividers run full length.
- **Maintainer question (open):** a transition between two sibling regions of one composite stacks the regions (S7, S17). The prototype's W4 leaves such edges out of the engine and draws them after layout, which can route through a state (S17) and should warn. v12 lays them out normally. The corpus has none, and UML forbids them. Should T3 adopt W4 with a warning, or pass these edges to the engine and accept stacked regions? A D-id records the answer.
- Soft notes: an edge crossing into a composite drops that composite's `direction` (v12 parity). A crossing edge can swap region order.

## #148 T5 integration (from #138)

- `packages/diagram-state` is `"private": true` so the release pack test (`tools/release/src/publish.spec.ts`) stays green. T5 drops `private` when it adds the manifest and registry entry.

## Maintainer question (from #138, open)

- `diagram-state/src/parser/source.ts` repeats the flowchart's source normalisation (comment-line removal, dropped `;`, the `="x"` quote rewrite), which parity needs. Sharing it means moving it into `@mermaid-js/core`: a core change, so a state T0 (D102). Keep the copy, or move it to core in a T0?
