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
- **Pipeline parent** (T3): x is the box centre, y is box top − square/6 (`wardleyRenderer.ts:359-364`), not the box centre. Follow v12.
- **Self-links** (T3): v12 writes a `<line>` with NaN coordinates. v13 drops them with D425's `WARDLEY_LINK_DROPPED` (never NaN, D424/D226).
- **Trends from a pipeline parent** are not horizontal in v12 (origin moved, target on the parent's original line, `:540-547`). Follow v12; the T3 "trends horizontal" invariant excepts trends from pipeline parents.
- **Extra group** `g.wardley-pipeline-links` (`.wardley-pipeline-evolution-link`, dashed `4 4`) between pipelines and links: kept (T4, class list in MIGRATION.md).
- **Metrics missing from the spec's list** (T3): axis labels at (p + cw/2, H − p/4) and (p/3, p + ch/2) rotated; anchor label centred, bold, y − 3; annotation markers r 10, number 10 px bold; box height n·16 + 20 + maxBBoxHeight/2. They go in the one metrics table.
- **Errors** (T2): v12 throws in category order (title, size, evolution, anchors, components, notes, pipelines, links, evolves, annotations, accelerators), not source order; an `evolve` on an unknown name never reaches the range check. v13 reports every one (R-PARSE-4), in source order. **Closed (#489):** every v12 message is an error with its text, in source order (`parity.spec.ts` checks all 11 contexts word for word); an out-of-range value is kept as 100, so it causes no second error.

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
- `tools/gen-config/src/theme-used-by.spec.ts` lists `wardley` in `NOT_DRAWN_YET`: [ ] **#493** drops it.
