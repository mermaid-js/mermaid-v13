# Gaps (spec #430)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Wardley adds no core contract (the theme table and the `wardley` section are #414's, merged); no ASCII ticket (D320).
- **Theme rows land with the renderer (T4),** in the package's `src/theme/vocabulary.ts` and `table.ts`, since #414 T0a/T0b are merged. The spec's pure-call core fallback is not used. T3 reads colours, if at all, through one stand-in module that T4 deletes.
- **T6 before T5**, as radar's run did.
- **Harvest** through packet's shared `cli/harvest-v12.ts` (a `wardley` row, `harvest:wardley`), not a parameterised pie harvester as the spec's T1 line says; the coordinator's wave-2 instruction supersedes it.
- **`gridColor` (spec, Integration).** The spec reads `gridColor` "as shared vocabulary", but it is gantt's own row (`diagram-gantt/src/theme/vocabulary.ts:17`, rule the literal `lightgrey` in every theme), so a wardley rule may not read it (CONTRACT, direction). **Choice:** `wardleyGridColor`'s light and dark rule is the literal `lightgrey`, as gantt's; no core row (R-PERF-8) and no gantt edit. This equals v12 in default, base, dark and forest; neutral's `hsl(0, 0%, 90%)` (v12 `lighten(border1, 30)`) is a family-rule approximation listed in T5's oracle `DIFFERENCES`. **For the maintainer:** moving `gridColor` to core instead would cost core bytes and a theme-spec value for neutral.

## Spec corrections from exploration (`01-v12-wardley.md`)

- **Token order** (T1): after `NAME_WITH_SPACES`, 2.0.1 orders `WS, ACC_DESCR, ACC_TITLE, TITLE, INT, STRING, ID, NEWLINE, WHITESPACE, YAML, DIRECTIVE, SINGLE_LINE_COMMENT`; there is no `FLOAT`. The runtime dump decides, not the spec's list. **Closed (#487):** the lexer follows the dump (43 types; `-` has LONGER_ALT ARROW, LINK_ARROW, YAML) and the gate is green.
- **Pipeline parent** (T3): x is the box centre, y is box top − square/6 (`wardleyRenderer.ts:359-364`), not the box centre. Follow v12. **Closed (#490):** as v12; a later pipeline sees an earlier one's move.
- **Self-links** (T3): v12 writes a `<line>` with NaN coordinates. v13 drops them with D425's `WARDLEY_LINK_DROPPED` (never NaN, D424/D226). **Closed (#490):** the layout drops them (the parser warns), and also a link whose ends coincide (v12: NaN), under the same `WARDLEY_LINK_DROPPED`.
- **Trends from a pipeline parent** are not horizontal in v12 (origin moved, target on the parent's original line, `:540-547`). Follow v12; the T3 "trends horizontal" invariant excepts trends from pipeline parents. **Closed (#490):** as v12; the invariant excepts parents a pipeline moved.
- **Extra group** `g.wardley-pipeline-links` (`.wardley-pipeline-evolution-link`, dashed `4 4`) between pipelines and links: kept (T4, class list in MIGRATION.md).
- **Metrics missing from the spec's list** (T3): axis labels at (p + cw/2, H − p/4) and (p/3, p + ch/2) rotated; anchor label centred, bold, y − 3; annotation markers r 10, number 10 px bold; box height n·16 + 20 + maxBBoxHeight/2. They go in the one metrics table. **Closed (#490):** all in `layout/metrics.ts`, with v12's line numbers.
- **Errors** (T2): v12 throws in category order (title, size, evolution, anchors, components, notes, pipelines, links, evolves, annotations, accelerators), not source order; an `evolve` on an unknown name never reaches the range check. v13 reports every one (R-PARSE-4), in source order. **Closed (#489):** every v12 message is an error with its text, in source order (`parity.spec.ts` checks all 11 contexts word for word); an out-of-range value is kept as 100, so it causes no second error.

## T4 (#493)

- Orchestrator choices kept: `wardleyGridColor` is the literal `lightgrey` (neutral's `hsl(0, 0%, 90%)` is T5's `DIFFERENCES` row); `g.wardley-pipeline-links` is drawn (MIGRATION.md).
- Choices (also in `tickets/493.md`): a `#name;` decodes through core's `entityAt` (its ~50 names and every numeric reference); another name (`#alpha;`) stays `&alpha;`, where a browser showed v12's `α`. Parity decodes v12's side with the full HTML table, so this is a listed divergence (`wardley-cases/entities-outside-core`, owner #493) with a MIGRATION.md row. **For the maintainer:** the full HTML name table would cost bytes in the wardley chunk. The background covers the view box (the bounds, D224), not only v12's canvas. Groups with nothing to draw are left out. New classes `wardley-link-head`, `wardley-trend-head`. `data-ast` also on `g.wardley-stages` (an `evolution`) and `g.wardley-annotations-box` (`annotations`).
- Review (#493) fixed: the v12 snapshot's decoder (above); accepted render probes moved to `nightly-check/render-*.mmd` and the entity parse probe to `nightly-check/parser-entity-codes.mmd`; `displayed()`, `HeadParts`, the build stroke in `OVERLAYS`, `drawStages`/`drawGrid`, dashes through `checkStyle`.
- Left to T5 (#497): MIGRATION.md rows for D421, D424 and the six D333(b) themes, the oracle theme specs and `DIFFERENCES`, the manifest, `configDefaults`, dropping `render-api.ts`'s `replace`.

## T3 (#490, merged)

- Orchestrator choices (review of #490, also in `tickets/490.md`):
  - Labels follow v12's `.text()`: one literal line, the model string with white space collapsed as a text node draws it; no `\n`/`<br>` breaks, no entity decoding (`layout-label-literal`, v12 DB probed).
  - D424 "never NaN or nothing": a padding with 2·padding ≥ width or height falls back to 48 (0 where 48 leaves none); `nodeRadius` must be above 0; a link with coincident ends is dropped under D425's one `WARDLEY_LINK_DROPPED` (the parser lists the ones it can see from the model; the layout raises it only when the parser did not) (`layout-link-coincident`).
  - Decreasing custom boundaries are valid v12 input and draw backwards, clamped to [0, 1] only (`layout-stages-decreasing`).
  - A pipeline box off its parent's line (last child merged by a later pipeline) is checked on the last child's line, a named skip (`layout-pipeline-merged-child`).
  - `WARDLEY_CONFIG_INVALID` stays once per bad key, as radar and cynefin. **For the maintainer:** D424 says "one warning".
- Also: the stage font is `max(0, axisFontSize − 2)`; no colours in the layout (no stand-in module needed).
- `#amp;` and a literal `&amp;` both reach the model as `&amp;`; v12 draws `&` for the first, `&amp;` for the second. The layout measures the model string. [x] **#493**: `parser/convert.ts` `displayText` decodes `#name;` / `#123;` to the character and keeps a literal `&name;` (the model, the layout and the drawing; parity's v12 snapshot decodes its placeholders the same way); cases `layout-label-literal`, `render-entities`, a parse probe with a comment inside `accDescr`, a stress shape.
- Review (#490) fixed: pitfall 10 parts objects (`Typesetter`), explicit pipeline positions, invariants on the e2e maps, config from `WardleyDiagramConfig`. Accepted: one `WARDLEY_CONFIG_INVALID` per key (for the maintainer); runtime entry 18.4 KB gz, layout 5.5 KB gz; core 93,426 B gz unchanged.
- For T4: strokes, dashes and opacities are in `WARDLEY_METRICS`; draw arrowheads from the layout's triangles; the viewBox is `bounds`; write `PlacedText.text` with `SvgWriter.text()`.

## T2 (#489, merged)

- Choices (also in `tickets/489.md`): D425's three warnings are raised by the parser, one per kind with the other places in `related`; v12's child→own-parent link filter is the renderer's (T3/T4 skip those links, no warning). Only the first `annotations` is range-checked (v12 read only it). Ids beyond D427: `wardley`, `annotations`, `accTitle`, `accDescr`; `note:<k>` is an ordinal. A pipeline component's range error is reported even where v12 never reached it (its pipeline's name failed or names no node).
- **For the maintainer:** link ids `link:<a>-><b>` use the names as written, not the resolved node ids (a link to a pipeline child by label is `link:Gas->Kettle`, its target `Kettle_Gas`).
- Review (#489) fixed: failed pipeline names now open the block with their components counted; the 17 v12 messages are asserted literally; the 32 v12-accepted parser cases are `nightly-check/parser-*.mmd` fixtures.
- Accepted judgement calls: the parser's `description` flag and hand-rolled `recover()`/`skipLine()` follow radar's convention; the runtime entry is 12.9 KB gz (radar's parser 9.0 KB), grammar breadth and message text, nothing test-side reachable (measured in review).
- For T3: `WardleyModel` keeps v12's node field names; annotations carry `x`/`y` (not `coordinates[]`); `evolution` replaces v12's `axes` (absent: v12's default stages).

## T1 (#487, merged)

- Review (orchestrator, `/code-review`): no hard standards violations. Fixed: five missing quirk cases (port + arrow, arrow label + `;` label, bare `+'x'>`, duplicate annotation numbers, bare `A B`); every skipped source named and the set asserted (`NOT_REACHED`, 17); the `unclosed-directive` exclusion asserts core's `UNCLOSED_DIRECTIVE`; stress sized for a 3–4 ms small lex (8 s for the file); one `wardleyView(src)` helper.
- Accepted judgement calls: the lexer plumbing and gate helpers copy radar's (a parser-kit extraction is a cross-port decision); `LINE_SEPARATORS` are hand-written cases, as gantt's and gitGraph's.
- **For the maintainer (radar, not wardley): a lone CR at the very end of a source** merges with the `\n` v12 appends and loses a NEWLINE token in radar's lexer (the same code); wardley's lexer handles it, and no radar case hits it. Not fixed here (out of scope).
- `tools/gen-config/src/theme-used-by.spec.ts` lists `wardley` in `NOT_DRAWN_YET`: [x] dropped by **#490** (the layout reads `fontFamily`).
