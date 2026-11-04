# Gaps — spec #127

Unmet criteria and shared contracts, by owning ticket.

## Held (blocked outside this spec)

- #142 T2, and everything after it (#144, #146, #148, #151): #27 and #28 are not merged into `mermaid-v13` yet (D107). #151 also waits on #29 and #31.

## #144 T3 layout (from #140, `v13/docs/research/state-regions.md`)

- Adopt the nested-group model: each region a title-less `LayoutGroup` in its composite, no edges between regions. No state T0 (D111).
- The builder stretches every region frame along the flow to the composite's inner size, so dividers run full length.
- **D113 (answered):** a transition between two sibling regions goes to the engine like any other edge, with no special handling and no warning; the regions stack, as in v12. W4 is dropped. #144's region checks skip composites that have such an edge (S7, S17).
- Soft notes: an edge crossing into a composite drops that composite's `direction` (v12 parity). A crossing edge can swap region order.

## #148 T5 integration (from #138)

- `packages/diagram-state` is `"private": true` so the release pack test (`tools/release/src/publish.spec.ts`) stays green. T5 drops `private` when it adds the manifest and registry entry.

## Shared source view (from #138, D114)

- D114: the v12 source view (comment-line removal, dropped `;`, the `="x"` quote rewrite) moves into the core parser kit in state T0 #162, which flowchart switches to. `diagram-state/src/parser/source.ts` stays, deprecated, until that T0 merges into `mermaid-v13`; then diagram-state adopts the kit version and deletes its copy (owner: #142, or a follow-up if #142 has merged by then). #162 is in draft PR #181 into `mermaid-v13`. When adopting: the kit has no option for state's `trimStart` or appended `\n`, and state's lexer must move from its per-character `at` array to `SourceOffsets`/`localOffset` (handoff: `tickets/162.md` on `feature/162_parser-kit-source-view`).
