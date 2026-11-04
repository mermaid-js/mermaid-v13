# GAPS: spec #124 (ER diagram port)

Unmet acceptance criteria and open contracts, under the ticket that owns each one.

## #130 T1 lexer gate (merged)

- No unmet criteria. 4 of 2,599 sources are not compared: commented variants whose mid-line cut splits the `erDiagram` keyword, so v12 never detects them (listed in `packages/conformance/src/er/lexer-parity.spec.ts`).
- Final `/code-review` over the lexer is deferred to the spec's finish step.

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

- No unmet criteria. No Playwright run yet; that is T5's (`pnpm e2e` under the lock).
- **D117 (maintainer, draft PR #188), applied in T5:** classic `rowEven` must equal v12's HSL lightening exactly (tested against v12; its MIGRATION row goes). Keep the shared `strokeWidth` and the whole-table author fill (MIGRATION rows stay, citing D117).

## #134 T5 integration (open items)

- Delete `packages/conformance/src/er/mermaid.ts`, the stand-in `createMermaid` with the `er` row made loadable and its two `import-boundaries` disables, once the manifest makes ER render through the public API.
- Until the ER spacing defaults land (nodeSpacing 140, rankSpacing 80), short edges crowd the crow's-foot ends and labels.

- Generate the ER section defaults (`SECTION_OWNERS`; v12 nodeSpacing 140, rankSpacing 80, minEntityWidth 100) and mark the keys the builder reads (`er.nodeSpacing`, `er.rankSpacing`, `er.minEntityWidth`) as honoured.
- **D116 (maintainer, draft PR #184): honour both.** Mark `er.entityPadding` (default 15) and `er.diagramPadding` (default 20) `honoured`. In px, `entityPadding` replaces the shared node padding inside entity table cells (v12's across × down meaning) and `diagramPadding` sets the margin around the drawing; the cell profile stays at 1-cell padding. Fix the MIGRATION.md ER row that says they are ignored, and cite D116 in code and tests.

- #136 ASCII: declare `ascii` in ER's manifest (`formats: ["svg","ascii"]`, `"ascii": "./dist/ascii.js"`, `loadAscii` → `@mermaid-js/diagram-er/ascii`'s `ascii`), regenerate the registry, then point `conformance/src/ascii/er-render.ts` at `createMermaid()` and drop its `ER_SECTION_DEFAULTS` once the generated defaults carry them (goldens unchanged). Add ER to `v13/docs/ascii.md` and the format matrix.

## #136 T7 ASCII (merged; open items)

- Done (final review, D124): ER fits `ascii.maxWidth` as flowchart does (D84: tighten, then LR→TB). The pipeline already passed it to ER's layout as `availableWidth`; it is now pinned by `er-v13/max_width` (turns at 40), `er-v13/max_width_tighten` (93 → 85 columns) and `er-api.spec.ts` (fit, `ASCII_TOO_WIDE`). Other ER goldens unchanged.

- **D118, amended by D124 (equal-to-default rule and the 6-cell rank floor confirmed), applied in T5:** in the cell profile ER uses the profile's own spacing and minimum entity width; `er.nodeSpacing`, `er.rankSpacing` and `er.minEntityWidth` convert from px only when the author sets them (as flowchart's `fromConfig`). v12's px defaults don't convert; SVG unchanged. Re-review the ER `expected*.txt` that change, keep the structural check green.

## #135 T6 language facet (merged; finish after T5)

- Facet, probe mode (the lexer now reports its jison start condition), generated tables and the bundle check are done. These wait on the T5 manifest giving ER a `load` in `firstPartyFacets` (language.md steps 4, 6, 7):
  - `git mv packages/conformance/language-goldens/er packages/language-service/goldens/er` and delete `packages/conformance/src/er/language-goldens.spec.ts` (its last test fails once ER has a `load`, on purpose).
  - Regenerate flowchart's `completions/empty.out`, which gains `erDiagram`, and review it. Run `property.spec` and `rename-round-trip.spec` over the ER corpus.
- Not done, doable after T5: the oracle-through-service spec (step 8, copy `flowchart/service-symbols.spec.ts`), and the 50k-character budget numbers (step 10, R-LANG-4).
- **Accepted (D119):** first-paint colours in the CodeMirror and Monaco adapters come via the cross-type ticket #190 (per-type first-paint highlighting), not this spec.

## Not started

- None. #134 T5 integration is running.
