# Gaps and choices, spec #522

Unmet acceptance criteria and choices not covered by the spec or a D-id, per owning ticket. Each choice is also listed under "For the maintainer" in the PR body.

## T1 (#538)

- `.*direction` rules come first in v12's lexer: any line containing `direction LR`, even inside a quoted label, is a lexer reject (01 note). **Closed (#538):** the lexer stays v12's, so a quoted `direction TB` stays one `Direction*` token and #539 reports it as D452's `direction` diagnostic; no gate exclusion. Choosing to let the label through instead is a lexer change and a gate exclusion for #539.
- **Closed (#538, coordinator's decision):** D452's two lexing changes (an unquoted argument stops at `)` and at a line end; a trailing `%%` keeps its line break) are not in the T1 lexer; #539 makes them in the lexer, each listed as a gate exclusion in `conformance/src/c4/lexer-parity.spec.ts`. The lone `title` is parser work.
- The syntax page shows its C4Context example twice; the docs fixtures are five files (`nightly-check/docs/`), the harvest keeps all six strings.

## T2 (#539)

- **Closed (#539):** D452's lexing changes are in the lexer, each a classified exclusion of `conformance/src/c4/lexer-parity.spec.ts` (`c4/d452.ts`, shared with the variant parity and the grammar specs). The lone `title` needed the lexer too (`title` right before a line break), not the parser alone: a third exclusion.
- **Closed (#539), oracle wins:** a named argument sets the field it names, except in the alias, relation-end and label slots (D452: moved there, `C4_NAMED_ARGUMENT_MOVED`) and `UpdateLayoutConfig` (by position); offset slots `parseInt` whatever lands there (`$textColor` there reads `"NaN"`). A named argument leaves its slot's field absent; the adapter compares field presence.
- **Closed (#539):** the `accDescr` leak is cleared per parse in the oracle wrapper (`c4/oracle-env.ts`), which also rejects an unknown relation end with v12's render message (D457), as xychart's wrapper does for "No Plot".
- **Closed (#539):** `Deployment_Node`/`Node` drop the sprite slot, a named argument there included; a named `$sprite` in another slot is kept.
- Choice (Pele's severity): `$__proto__` is accepted as an `extra` name with a `C4_NAME_RESERVED` warning (Pele keeps it silently; D452 asks for a diagnostic); a listed accept divergence.
- Coordinator's decision (review of #539): structural `$names` follow v12 (`$alias` renames, a relation's `$type`/`$from`/`$to` set kind and ends, `UpdateElementStyle`'s `$parentBoundary`/`$typeC4Shape`/`$nodeType` apply; one v12 set again after a macro's arguments does nothing). Cases `named-alias`, `named-type`, `named-parent-boundary`(-unknown), `named-boundary-alias`.
- **For the maintainer (D450):** where v12's structural value broke the model, v13 keeps the structure with one `C4_STRUCTURE_KEPT` warning: `$parentBoundary` naming no boundary (v12 dropped the element from the drawing), an unknown `$typeC4Shape` or `$nodeType`, `$wrap` (wrapping is config), and a boundary renamed by `$alias` (v12 left the statements in its braces under the old alias, outside the diagram). Two listed divergences (`named-parent-boundary-unknown`, `named-boundary-alias`).
- `C4_NAMED_ARGUMENT_MOVED` also covers the relation-end slots (D452 names alias and label): the end is then empty, so the relation also fails `C4_UNKNOWN_END`, as v12 failed it at render.
- The front-matter `title` is compared (D453): `c4-cases/front-matter` and `titles.mmd` are listed divergences.
- Choice: model parity over the lexer gate's variants runs in `c4/parity.spec.ts` (packet's precedent) instead of the main suite: a variant may differ only by a D452 lexing exclusion, as its listed source, or by D453's title trim; 89 divergences are listed, not ~780; a variant excused by its source must differ from v12 at the same paths (blanks aside), so no further difference hides.
- Choice: after a lexer error, a line break in the macro or `$name=` state is a zero-width error that leaves those states (ungated: jison stopped at the error), so recovery resumes at the next line.
- For T5: MIGRATION.md rows for D452/D453; the registry row (D451) and `detectC4`. For T6: hover on the five headers shows the `diagram` rule's doc (gen:grammar's tie-break); `C4Argument` ranges are there for slot hover.

## T3 (#540)

- Choice (oracle wins over the spec's wording): an element's text is v12's order, the bold name, then `[Person]`/`[Container: techn]`, then the description (`c4LabelHelper.ts` sections `c4-name`, `c4-type`, `c4-descr`, checked in the 12.2.0 dist); the spec's "Layout (T3)" put the type line above the name.
- Choice (D454's lengths, no D-id for the mapping): elements `2·c4ShapeMargin` apart both ways (v12's packer), rows after the first `nextLinePaddingX` in; contents `c4ShapeMargin` inside a frame on every side, below the header; boundaries `diagramMarginX` apart across and `c4ShapeMargin + diagramMarginY` down (v12's `stopy + margin` then `+ diagramMarginY`); the canvas margins are `diagramMarginX`/`Y`, v12's 60 px title row above. Elements keep their own height in a row (v12; Pele stretched them). The header is v12's (centred; label `boundaryFontSize + 2` bold at 8, `[type]` 5 below, description `− 2` 20 below); Pele's sliding heading is not ported, so a line may cross a header.
- Choice: every shape is sized with `c4ShapePadding` (v12 classic): `max(width, text + 2·pad)`; person +26, cylinder `+3·ry`, queue `+2·rx`, `fr-rect` +16. **For T4:** neo's cylinder/`fr-rect`/`h-cyl` paddings (core rows `cylinderPadding*`, `subroutinePadding*`; their users come from the source scan after #637) go into `shapeSize` (`layout/shapes.ts`), read in the layout, not the renderer (one pipeline).
- **For the maintainer:** with root `wrap` and `c4.wrap`, a relation label wraps at Pele's room (88 px across a column gap, else 160). v12's limit there was the text's own width (`calcC4ShapeTextWH` got `calculateTextWidth(text)`), so a v12 relation label never wrapped; this is a visible change when both flags are set. A boundary header wraps at `max(contents' width, c4.width)` (v12's limit came from `screen.availWidth`). The title is 16 px normal in the theme family (v12's root font), not the theme's `fontSize` (no second core row).
- Choice: the router clips to the real outlines, rounded corners included (Pele treated `rounded` as a rectangle), so ends lie on the drawn outline. Arrowhead trims are the renderer's: `c4RelationPath(rel, startTrim, endTrim)`.
- Choice: `C4_BOUNDARY_CYCLE` is a render warning (`ctx.warn`, AST id of the boundary moved), raised by the layout: on each cycle, the boundary first in the model goes to the top level.
- Font family keys go through `checkStyle` (`STYLE_VALUE_DROPPED`, sequence's precedent); size keys through `fontSizePx` (base 14).
- No core edit (after #637): c4's `fontFamily` read is found by the source scan (`gen:theme` lists c4 in `theme-variables.md`); `theme.notDrawnYet` is gone from `workspace.yaml`, and the Pele credits are `credits.files` there (Pele is a shared upstream already in mermaid's own notices, so no `notices/mermaid.txt`, as flowchart and state). Core gz unchanged.
- Listed exceptions to "relations cross no other element" (e2e corpus, 141 relations): 4 relations in `nightly-check/large-diagram` (6 crossings, pinned in `layout/layout.spec.ts`): a diagonal between boundaries finds no free two-bend elbow, and the ported router tries no longer route. Inference, not run: Pele's own router would cross there too, as it has the same elbow search. The docs examples and every other fixture cross nothing.
- R-SEC-5/D455 budget (coordinator's decision on review): the router and the label placement count the comparisons they make (`Work` in `layout/route.ts`: the box scans of `clearOf` and the blocked check, `Lanes.free`/`crossings`, the detour's scans, each label's `covered`), against `min(2,000,000, limits.maxLayoutWork)` (D542's limit, default 1,500,000, so the default budget is 1,500,000). Once spent, the relations left go straight and their labels sit at their middle, in model order (`C4Layout.careful` false); never an error. Pele's up-front estimate `rels · (elements + boundaries + 3·rels)` understated the work about tenfold: 600 elements with 400 long relations were careful and took about 0.5 s; now the budget runs out after about 40 relations and the layout takes about 50 ms (not measured on a steady machine). **For the maintainer:** `maxLayoutWork` lowers the router's care instead of failing the render as gantt's does.

## T4 (#541)

- Block's T0 merged as #589 (`mermaid-v13` ad3648a91): `cylinderPadding*` (`cyx`, `cyy`) and `subroutinePadding*` (`srx`, `sry`) are core rows in `packages/core/src/theme/vocabulary.ts` with `usedBy: ['flowchart']` (plus block). Since #637, core rows' users come from a scan of c4's sources: T4 edits no core `usedBy`. The integration branch merges `mermaid-v13` before T4 starts.
- v12 never draws a boundary's `$fontColor` (text always `#444444`, `svgDraw.ts:167,175`). Keep v12 (light themes v12-identical, D456); the boundary text reads `c4BoundaryColor`. List in MIGRATION.md only if v13 changes it.
- v13 flowchart shapes have no per-shape intersect functions (only `cyl` defines `shapeInset`); the router's outline clip (Pele `route.ts` `hit()`) lives in the package, with T3.

## T5 (#542)

## T6 (#543)

## T7 (#545)
