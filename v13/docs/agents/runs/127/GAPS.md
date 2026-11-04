# Gaps — spec #127

Unmet criteria and shared contracts, by owning ticket.

## Held (blocked outside this spec)

- Nothing. M2.5 merged into `mermaid-v13` (#123 at `0045ffde0`); #27, #28, #29 and #31 are closed. T2 (#142) is not blocked by #162 (D114, per the maintainer); the native blocked-by link from #162 still has to be removed by hand (`gh api -X DELETE repos/mermaid-js/mermaid-v13/issues/142/dependencies/blocked_by/<#162 issue id>`).

## #144 T3 layout (from #140, `v13/docs/research/state-regions.md`)

- [x] Done in #144: nested-group model, frame stretch, D113 edges, region checks in
  `conformance/src/state/layout.spec.ts`. Prototype folder deleted.
- [x] **Engine gap (fixed by state T0 #187):** `layered` leaves a group's self-loop and
  its label out of the drawing's extent (`v2-a-compound-state-should-be-able-to-link-to-itself`,
  `Active --> Active`): the loop runs off the right edge. Pinned as `ENGINE_GAPS` in the layout
  spec; no core change from #144 (D102).
- [ ] **Escalated (#144):** a composite with no `direction` is laid out TB in any diagram (v12's
  `getDir` default), and a note sits in its state's composite (v12 put notes at the top level).
- Adopt the nested-group model: each region a title-less `LayoutGroup` in its composite, no edges between regions. No state T0 (D111).
- The builder stretches every region frame along the flow to the composite's inner size, so dividers run full length.
- **D113 (answered):** a transition between two sibling regions goes to the engine like any other edge, with no special handling and no warning; the regions stack, as in v12. W4 is dropped. #144's region checks skip composites that have such an edge (S7, S17).
- Soft notes: an edge crossing into a composite drops that composite's `direction` (v12 parity). A crossing edge can swap region order.

## #148 T5 integration (from #138)

- [x] Done in #148: `private` dropped; the package is published (version `13.0.0-alpha.0`, `THIRD_PARTY_NOTICES` for the Pele-derived `render/edges.ts`), and the pack test lists it.

## Shared source view (from #138, D114)

- [x] **Adopt the shared source view** — done in #142: `parser/view.ts` builds the state text on the kit's `sourceView` (holes, dropped `;`, tag quotes) with `SourceOffsets` / `localOffset`, adds state's `trimStart` and appended `\n`, and `source.ts` is deleted. Lexer gate unchanged (593 of 600, 0 diffs). Not done: the lexer still reads offsets from a per-character table (filled from `SourceOffsets`), because state's text reads CRLF as one LF and so does not line up with the kit's runs.

- D114: the v12 source view (comment-line removal, dropped `;`, the `="x"` quote rewrite) moves into the core parser kit in state T0 #162, which flowchart switches to. `diagram-state/src/parser/source.ts` stays, deprecated, until that T0 merges into `mermaid-v13`; then diagram-state adopts the kit version and deletes its copy (owner: #142, or a follow-up if #142 has merged by then). #162 merged via PR #181. When adopting: the kit has no option for state's `trimStart` or appended `\n`, and state's lexer must move from its per-character `at` array to `SourceOffsets`/`localOffset` (handoff: `tickets/162.md` on `feature/162_parser-kit-source-view`).

## #144 T3 / #146 T4 (from #142)

- `StateModel` ids are v12's (`root_start`, `X_end`, `X:region1`). A state's `parent` is its composite or region. Notes carry no parent: v12 put every note group at the top level.
- v12 render-data specs (`stateNoteEdge`, `stateNoteNode`, `stateDiagram-colorIndex`) are ported as skips for the builder and renderer: note edges dashed, a note on a composite is no group, one palette slot per composite shared by its regions. The renderer specs (`stateRenderer*.spec.js`) were not ported.
  - [x] Done in #146: note connectors dashed with no arrowhead, no note group, one slot per
    composite shared by its regions (styled composites spend theirs unpainted). Checked through
    the render entry in `diagram-state/src/render/render.spec.ts`; the v12 specs stay skipped
    (they read v12's `getData`, which v13 has no equivalent of).

## #146 T4 renderer

- [x] **Done (D120, D126, #193, #197):** the renderer reads `compositeTitleBackground` (title
  band), `compositeBackground` (a top-level composite's body) and `altBackground` (a nested
  composite's body) instead of `clusterBkg` and `background`. Checked in
  `diagram-state/src/render/render.spec.ts`; MIGRATION.md "State diagram SVG structure" updated
  (review fixes, `feature/127_review-fixes`).
- [x] **Accepted (D121):** v12 tinted each concurrency region with its composite's palette fill; v13
  draws the regions unfilled (dashed dividers only), as tinted frames left untinted strips at
  every divider gap. MIGRATION.md cites D121 (#148).
- [x] **Accepted (D122):** the front-matter `title` is not drawn (as flowchart's SVG);
  `state.titleTopMargin` is `ignored` with that reason. MIGRATION.md cites D122 (#148).
- Fixed in #146 (layout, #144 code): the region stretch ignored the composite's title height,
  so region frames and dividers ran over the title band. And a classDef's `color` painted the
  shape too (v12's `textStyles` repeat it as `fill`); only the label takes it now.
- The composite self-loop engine gap (#187) is fixed in core and merged: every corpus file
  draws inside its viewBox.

## Answered (from #142)

- [x] **Trailing empty concurrency region** (D115, "Drop it, warn"): v13 does not draw it (v12 drew each `--` as a stray `divider` node) and gives one `EMPTY_REGION` warning per diagram. MIGRATION.md lists it under state's "Removed v12 behaviour".

## Outside this spec (seen after merging `mermaid-v13` at `5a6425d8e`)

- `.gitignore` now un-ignores `/.claude/skills/` (#129, for `release-alpha`). A worktree that holds local skill copies then fails `pnpm check`'s `prettier --check .` on untracked files (`.claude/skills/recheck-issue/scripts/*`). Fixed: `.claude/` added to `.prettierignore` here, identical to PR #183 into `mermaid-v13`, so the two merge cleanly.

## Core `sourceView` mid-line directive bugs (found by class, fix owned by class)

- [x] Closed: #186 merged in (`3f1fce34a`); both state forms are lexer-parity edge cases, parity 597 of 604 sources lexed by v12 with 0 diffs. Was: two cases in core `sourceView` (#181): a `%%` line inside a mid-line `%%{…}%%` directive becomes a comment hole that runs past `}%%`, and text inside a directive triggers the `;` drop. When class's core fix merges into `mermaid-v13`, merge it here and add state forms of both strings to the lexer-parity harvest (e.g. `stateDiagram\nA %%{init: {\n  %%x "a": 1}}%%\nB` and `stateDiagram\nA : x %%{init: {"a":"style"}}%% :#y;`). Until then, if state parity shows either, list it as a known divergence pointing at the class fix.

## Composite self-loop (from #144)

- [x] Closed: #189 merged into `mermaid-v13` (`f9fafcd93`) and here; `ENGINE_GAPS` is empty, and #146 dropped the pinned file from the render viewBox check: the self-loop now draws inside the viewBox.

## #148 T5 integration (from #151)

- [x] Done in #148: `"language"` in the manifest, `gen:registry` run, `pending-facets.ts` deleted. The
  devDependency stays, now with an optional peer like flowchart's: the generated `facets.gen.ts`
  imports `@mermaid-js/diagram-state/language`. `language-server` depends on it (it serves state).
- [x] Done in #148: `UNCLOSED` is `UNCLOSED_COMPOSITE`, and `state x |` offers `{`.
- [x] Done in #148: `bench/src/language-bundle.spec.ts` runs for flowchart and state.
- Seen in #148, left to the facet (listed in `rename-round-trip.spec.ts` `KNOWN_BACK_REFUSALS`):
  a rename whose way back is refused, because the original id is one `isValidId` will not take
  (`State1:` from `state State1: Description` in the corpus, HTML-escaped `&lt;&lt;fork&gt;&gt;`).
  `isValidId` also refuses CJK ids outright, even where no `class`/`style` names them.

## Accepted (maintainer)

- [x] **First-paint colours via #190** (D119, draft PR #191): the CodeMirror and Monaco adapters colour the first paint with flowchart's grammar for every diagram type. Choosing the highlighter per type is cross-type ticket #190, after the M3 facets land. #151 does not change the adapters.

## #127 final review fixes

- [ ] **Open (maintainer):** `A:::cls` as a statement on its own (any scope), and `A:::cls`
  inside a composite, set no class: v12's `extract` applies `:::` only from top-level
  transitions. v13 keeps that (parity) with no warning yet; the no-op warnings of the review
  (`IGNORED_IN_COMPOSITE`, `LINK_NOT_DRAWN`, `SCALE_IGNORED`) do not cover it.
