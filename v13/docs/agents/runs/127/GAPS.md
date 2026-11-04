# Gaps — spec #127

Unmet criteria and shared contracts, by owning ticket.

## Held (blocked outside this spec)

- Nothing. M2.5 merged into `mermaid-v13` (#123 at `0045ffde0`); #27, #28, #29 and #31 are closed. T2 (#142) is not blocked by #162 (D114, per the maintainer); the native blocked-by link from #162 still has to be removed by hand (`gh api -X DELETE repos/mermaid-js/mermaid-v13/issues/142/dependencies/blocked_by/<#162 issue id>`).

## #144 T3 layout (from #140, `v13/docs/research/state-regions.md`)

- Adopt the nested-group model: each region a title-less `LayoutGroup` in its composite, no edges between regions. No state T0 (D111).
- The builder stretches every region frame along the flow to the composite's inner size, so dividers run full length.
- **D113 (answered):** a transition between two sibling regions goes to the engine like any other edge, with no special handling and no warning; the regions stack, as in v12. W4 is dropped. #144's region checks skip composites that have such an edge (S7, S17).
- Soft notes: an edge crossing into a composite drops that composite's `direction` (v12 parity). A crossing edge can swap region order.

## #148 T5 integration (from #138)

- `packages/diagram-state` is `"private": true` so the release pack test (`tools/release/src/publish.spec.ts`) stays green. T5 drops `private` when it adds the manifest and registry entry.

## Shared source view (from #138, D114)

- [ ] **Adopt the shared source view once #181 merges** (owner: #142 if still open, else a follow-up): import it from `@mermaid-js/core/parser-kit` and delete `diagram-state/src/parser/source.ts`.

- D114: the v12 source view (comment-line removal, dropped `;`, the `="x"` quote rewrite) moves into the core parser kit in state T0 #162, which flowchart switches to. `diagram-state/src/parser/source.ts` stays, deprecated, until that T0 merges into `mermaid-v13`; then diagram-state adopts the kit version and deletes its copy (owner: #142, or a follow-up if #142 has merged by then). #162 is in draft PR #181 into `mermaid-v13`. When adopting: the kit has no option for state's `trimStart` or appended `\n`, and state's lexer must move from its per-character `at` array to `SourceOffsets`/`localOffset` (handoff: `tickets/162.md` on `feature/162_parser-kit-source-view`).

## Outside this spec (seen after merging `mermaid-v13` at `5a6425d8e`)

- `.gitignore` now un-ignores `/.claude/skills/` (#129, for `release-alpha`). A worktree that holds local skill copies then fails `pnpm check`'s `prettier --check .` on untracked files (`.claude/skills/recheck-issue/scripts/*`). Fixed: `.claude/` added to `.prettierignore` here, identical to PR #183 into `mermaid-v13`, so the two merge cleanly.
