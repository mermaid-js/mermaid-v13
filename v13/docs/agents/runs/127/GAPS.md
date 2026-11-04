# Gaps — spec #127

Unmet criteria and shared contracts, by owning ticket.

## Held (blocked outside this spec)

- Nothing. M2.5 merged into `mermaid-v13` (#123 at `0045ffde0`); #27, #28, #29 and #31 are closed. T2 (#142) is not blocked by #162 (D114, per the maintainer); the native blocked-by link from #162 still has to be removed by hand (`gh api -X DELETE repos/mermaid-js/mermaid-v13/issues/142/dependencies/blocked_by/<#162 issue id>`).

## #144 T3 layout (from #140, `v13/docs/research/state-regions.md`)

- [x] Done in #144: nested-group model, frame stretch, D113 edges, region checks in
  `conformance/src/state/layout.spec.ts`. Prototype folder deleted.
- [ ] **Engine gap (state T0 candidate, maintainer):** `layered` leaves a group's self-loop and
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

- `packages/diagram-state` is `"private": true` so the release pack test (`tools/release/src/publish.spec.ts`) stays green. T5 drops `private` when it adds the manifest and registry entry.

## Shared source view (from #138, D114)

- [x] **Adopt the shared source view** — done in #142: `parser/view.ts` builds the state text on the kit's `sourceView` (holes, dropped `;`, tag quotes) with `SourceOffsets` / `localOffset`, adds state's `trimStart` and appended `\n`, and `source.ts` is deleted. Lexer gate unchanged (593 of 600, 0 diffs). Not done: the lexer still reads offsets from a per-character table (filled from `SourceOffsets`), because state's text reads CRLF as one LF and so does not line up with the kit's runs.

- D114: the v12 source view (comment-line removal, dropped `;`, the `="x"` quote rewrite) moves into the core parser kit in state T0 #162, which flowchart switches to. `diagram-state/src/parser/source.ts` stays, deprecated, until that T0 merges into `mermaid-v13`; then diagram-state adopts the kit version and deletes its copy (owner: #142, or a follow-up if #142 has merged by then). #162 merged via PR #181. When adopting: the kit has no option for state's `trimStart` or appended `\n`, and state's lexer must move from its per-character `at` array to `SourceOffsets`/`localOffset` (handoff: `tickets/162.md` on `feature/162_parser-kit-source-view`).

## #144 T3 / #146 T4 (from #142)

- `StateModel` ids are v12's (`root_start`, `X_end`, `X:region1`). A state's `parent` is its composite or region. Notes carry no parent: v12 put every note group at the top level.
- v12 render-data specs (`stateNoteEdge`, `stateNoteNode`, `stateDiagram-colorIndex`) are ported as skips for the builder and renderer: note edges dashed, a note on a composite is no group, one palette slot per composite shared by its regions. The renderer specs (`stateRenderer*.spec.js`) were not ported.

## Answered (from #142)

- [x] **Trailing empty concurrency region** (D115, "Drop it, warn"): v13 does not draw it (v12 drew each `--` as a stray `divider` node) and gives one `EMPTY_REGION` warning per diagram. MIGRATION.md lists it under state's "Removed v12 behaviour".

## Outside this spec (seen after merging `mermaid-v13` at `5a6425d8e`)

- `.gitignore` now un-ignores `/.claude/skills/` (#129, for `release-alpha`). A worktree that holds local skill copies then fails `pnpm check`'s `prettier --check .` on untracked files (`.claude/skills/recheck-issue/scripts/*`). Fixed: `.claude/` added to `.prettierignore` here, identical to PR #183 into `mermaid-v13`, so the two merge cleanly.

## Core `sourceView` mid-line directive bugs (found by class, fix owned by class)

- [x] Closed: #186 merged in (`3f1fce34a`); both state forms are lexer-parity edge cases, parity 597 of 604 sources lexed by v12 with 0 diffs. Was: two cases in core `sourceView` (#181): a `%%` line inside a mid-line `%%{…}%%` directive becomes a comment hole that runs past `}%%`, and text inside a directive triggers the `;` drop. When class's core fix merges into `mermaid-v13`, merge it here and add state forms of both strings to the lexer-parity harvest (e.g. `stateDiagram\nA %%{init: {\n  %%x "a": 1}}%%\nB` and `stateDiagram\nA : x %%{init: {"a":"style"}}%% :#y;`). Until then, if state parity shows either, list it as a known divergence pointing at the class fix.

## Composite self-loop (from #144)

- [x] Closed: #189 merged into `mermaid-v13` (`f9fafcd93`) and here; `ENGINE_GAPS` is empty. Was: maintainer "Fix in core now". State T0 #187 (PR #189): the layered engine counts a group's self-loop and its label in the drawing and parent sizes. When it merges into `mermaid-v13`, merge it here and remove the case from `ENGINE_GAPS` in `conformance/src/state/layout.spec.ts`.

## #148 T5 integration (from #151)

- [ ] Add `"language"` to the state manifest and run `gen:registry`. Then delete state's row in `packages/language-service/src/testing/pending-facets.ts` and the `@mermaid-js/diagram-state` devDependency of `packages/language-service`.
- [ ] Optional: no `{` completion after `state x `, because state's error code is `UNCLOSED`, not `UNCLOSED_*`, and completion-validity counts it as an error. Rename `UNCLOSED` to `UNCLOSED_COMPOSITE` if wanted; that's a message-code change, so update the snapshots.
- [ ] Optional: a bench language-bundle spec for state (only flowchart has one).
