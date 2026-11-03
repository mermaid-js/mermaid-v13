# Final review — spec #37 (fix list for one implementer)

Two-axis review (standards + spec) of feature/37_m2-ascii vs mermaid-v13, plus open GAPS items. Fix all of these.

## Engine / layout
1. Edges still run through group titles in nested-subgraph corpus cases (`66/68-more-nested-subgraph-cases`, e.g. `┌ thr┴e┼──┐`; 17 corpus renders). Fix in the engine, then drop the title exclusion in `conformance/src/ascii/corpus.spec.ts` and make "every edge connects box to box" a corpus property.
2. Content in a narrow group frame sits one cell left (golden `level3`).
3. Width fitting: when `ascii.maxWidth` turns LR → TB, rank spacing keeps its LR (x-axis) cell value — 5 blank rows vs 2 for native TB. Recompute spacing for the turned direction.

## Tests
4. `core/ascii/repair.spec.ts:755-758` asserts wall-clock time. Replace with a work bound (expanded-cell / probe count or `maxSearch`) — no `Date.now()` in unit tests (D26/D87 determinism; timing belongs to bench, R-PERF-5).
5. The "no overlapping boxes" corpus property runs on `layoutCells`, a hand copy of the API's layout. Check the layout the API actually produced (e.g. capture it with a `postLayout` extension hook through the public API) and drop the copy if nothing else needs it.
6. The "at least one line exactly `columns` wide" check is tautological (same computation as api.ts). Make it independent or state in the spec why it is a contract check.

## CLI / docs (maintainer-visible choices, flagged in the PR)
7. CLI flags must win over diagram config: `--charset`/`--width` currently rank below front matter/directives. Make explicit flags override `ascii.*` from the diagram text; document the precedence in `v13/docs/ascii.md` and `--help`.
8. `--format png` (a value outside `ascii|svg`) is a usage error → exit 1 with a usage message. Exit 2 stays for `UNSUPPORTED_FORMAT` from the API; cover it with a process spec on a registered type without ascii if one can be loaded, otherwise note why it is unreachable in M2 in the docs.
9. Docs table lists every CLI flag actually accepted (`-h/--help`, `-v/--version`, `--charset unicode|ascii`). Document `ASCII_ROUTE` as a warning code next to the D82 ones.

## Size
10. D87 says the 15 KB ascii budget is soft: make the `ascii-size` gate report-only (the repo's existing soft/report mechanism), keep the measurement and the "SVG path never loads ascii" bundle test hard.

## Standards smells (judgement calls — do these, they are cheap)
11. Direction constants (`UP/RIGHT/DOWN/LEFT`, `DX/DY`, `BOX_ARM`/`INTO`) are duplicated in `core/ascii/repair.ts` and `diagram-flowchart/src/ascii/draw.ts`: export once from the kit, import in the flowchart.
12. The `ascii` config section is resolved twice (`diagram-flowchart/src/ascii.ts` options() and `mermaid/src/api.ts` asciiOptions()): one resolver in core.

## Out of scope (record in GAPS, don't fix)
- `LaidOut.layout` declared `LayoutModel` but flowchart hands `FlowLayout` (pre-existing contract issue).
- `units.id === 'cell'` used as a format flag in 3 places; `checkText` called up to 3× per path; `(text, s, options, analysis)` data clump in api.ts.
