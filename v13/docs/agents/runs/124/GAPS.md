# GAPS: spec #124 (ER diagram port)

Unmet acceptance criteria and open contracts, under the ticket that owns each one.

## #130 T1 lexer gate (merged)

- No unmet criteria. 4 of 2,599 sources are not compared: commented variants whose mid-line cut splits the `erDiagram` keyword, so v12 never detects them (listed in `packages/conformance/src/er/lexer-parity.spec.ts`).
- Covered by the final whole-branch review (`review.md`).

## #131 T2 grammar/parser/model (merged)

- No unmet criteria. D114 closed: diagram-er reads core's `sourceView` through `src/parser/view.ts`; its own `source.ts` is deleted, lexer parity still 100%.
- Closed by #135: the ER lexer reports its start condition as the probe's `mode`.
- Known limit: after an error, a stray `{` opens an attribute block in the lexer, so recovery skips to the next `}`.
- Not ported, with reasons in the port script: `erDb.spec.js` (calls the DB directly, no parse) and `erRenderer.spec.ts` (T4 territory).

## Core `sourceView` directive fix (#186, merged in)

- Done. Four ER directive cases added to the lexer-parity `PREPROCESSING` set; parity stays at 100% (2,607 of 2,611, same 4 undetected). Against the pre-#186 `sourceView`, the `%%`-line-inside-a-directive case fails and the two `"style"`-inside-a-directive cases already passed, so ER's `;` drop was not affected by the second bug.

## #132 T3 layout (merged)

- No unmet criteria. Fixed at merge: `grammar/generated/*` was gitignored and never committed, so `check:grammar` failed in fresh worktrees (the flaky push after #131). Now force-added, as flowchart's are.
- Core `layered` gap, not in the corpus, flowchart has it too: an edge from a group to its own member puts the label on the member (`G ||--|| A`, A in G). Belongs to a core ticket, not this spec. The other half, a group self-loop running outside the drawing, is fixed by #189 (merged in); `er-layout.spec.ts` now has an ER self-loop case, which fails in px without #189.

## #133 T4 SVG renderer (merged)

- No unmet criteria. D117 applied in T5: classic `rowEven` equals v12's HSL lightening exactly (tested against v12 through the oracle); the shared `strokeWidth` and the whole-table author fill stay, citing D117.

## #134 T5 integration (merged)

- No unmet criteria. Manifest (svg + ascii) and registry in v12's detector order; `er` section defaults generated, every `er` key honoured or ignored with a reason (`theme`, `titleTopMargin` stay pending, as for flowchart); D116 (`entityPadding`, `diagramPadding` in px), D117, D118/D124 applied and cited; the stand-in `createMermaid` deleted; 9 baseline fixtures; MIGRATION, `ascii.md` and the format matrix updated. Numbers in `tickets/134.md` (D110, report only).

## #135 T6 language facet (merged; finished in T5)

- No unmet criteria. Goldens moved to `packages/language-service/goldens/er`; flowchart's `completions/empty.out` gains only `erDiagram`; `property.spec` and `rename-round-trip.spec` cover ER; the oracle-through-service spec is added; a 50k-character ER document takes 11.5 ms per editing cycle (R-LANG-4, 15 ms budget).
- **Accepted (D119):** first-paint colours in the CodeMirror and Monaco adapters come via #190.

## #136 T7 ASCII (merged)

- No unmet criteria. D118 amended by D124 applied: cells use the profile's own spacing unless the author sets a px key (a value equal to the generated default counts as not set), with a 6-cell rank floor; 140 goldens re-reviewed, structural check green. `ascii.maxWidth` fitting (D84) pinned by `er-v13/max_width`, `max_width_tighten` and `er-api.spec.ts`.

## Final review (`review.md`, all fixed)

- Five findings fixed test-first, plus maxWidth. SVG changed for 58 of 215 ER corpus files (self-loops 42 px out instead of 26; ends along a side 26 px apart instead of 16).

## Awaiting maintainer acceptance

1. **Very crowded entity sides draw narrow ends.** Where more ends share a side than fit (seven ends on a 48 px LR side), `fitEnds` draws the crow's-feet about 3 px wide so neighbours stay apart. Growing the entity to fit full-size ends would change box sizes. Accept, or grow the box.
2. **Core `layered` label gap** (flowchart has it too, not in the corpus): an edge from a subgraph to its own member puts the label on the member. A core ticket, not this spec.
3. **Quoted names get no definition** in the language service: 315 ER names written only in quotes, the same shared gap as flowchart's quoted subgraph ids; the oracle spec pins the count.
4. **Known parser limit:** after an error, a stray `{` opens an attribute block, so recovery skips to the next `}`.
