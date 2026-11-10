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

## T4 (#541)

- Block's T0 merged as #589 (`mermaid-v13` ad3648a91): `cylinderPadding*` (`cyx`, `cyy`) and `subroutinePadding*` (`srx`, `sry`) are core rows in `packages/core/src/theme/vocabulary.ts` with `usedBy: ['flowchart']` (plus block). Since #637, core rows' users come from a scan of c4's sources: T4 edits no core `usedBy`. The integration branch merges `mermaid-v13` before T4 starts.
- v12 never draws a boundary's `$fontColor` (text always `#444444`, `svgDraw.ts:167,175`). Keep v12 (light themes v12-identical, D456); the boundary text reads `c4BoundaryColor`. List in MIGRATION.md only if v13 changes it.
- v13 flowchart shapes have no per-shape intersect functions (only `cyl` defines `shapeInset`); the router's outline clip (Pele `route.ts` `hit()`) lives in the package, with T3.

## T5 (#542)

## T6 (#543)

## T7 (#545)
