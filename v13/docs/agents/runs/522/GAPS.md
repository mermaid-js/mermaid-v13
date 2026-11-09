# Gaps and choices, spec #522

Unmet acceptance criteria and choices not covered by the spec or a D-id, per owning ticket. Each choice is also listed under "For the maintainer" in the PR body.

## T1 (#538)

- `.*direction` rules come first in v12's lexer: any line containing `direction LR`, even inside a quoted label, is a lexer reject (01 note). **Closed (#538):** the lexer stays v12's, so a quoted `direction TB` stays one `Direction*` token and #539 reports it as D452's `direction` diagnostic; no gate exclusion. Choosing to let the label through instead is a lexer change and a gate exclusion for #539.
- **Closed (#538, coordinator's decision):** D452's two lexing changes (an unquoted argument stops at `)` and at a line end; a trailing `%%` keeps its line break) are not in the T1 lexer; #539 makes them in the lexer, each listed as a gate exclusion in `conformance/src/c4/lexer-parity.spec.ts`. The lone `title` is parser work.
- The syntax page shows its C4Context example twice; the docs fixtures are five files (`nightly-check/docs/`), the harvest keeps all six strings.

## T2 (#539)

- **D452 lexing changes land here, in the lexer** (coordinator choice, T1 review): T1's lexer is exactly v12's. T2 changes it so an unquoted argument stops at `)` and at a line end, and a trailing `%%` comment keeps its newline, and lists each as a gate exclusion in `packages/conformance/src/c4/lexer-parity.spec.ts`. The other D452 items are parser/model changes. Q2–Q7 fixtures (D452–D457) belong to T2–T4.
- **Spec correction (oracle wins, pitfall 29):** the spec says named arguments "fill the slot they land in, not the slot they name". v12's `assignAttributes` (`c4Db.ts:31–51`) sets the field the name gives (`bag[key]`) everywhere except the alias/label slots (raw object stored, D452 changes that) and `UpdateLayoutConfig` (by position). `UpdateRelStyle`'s `parseInt` still reads by slot (`$textColor` in slot 5 → `NaN`, `$offsetX` in slot 3 stays `"5"`). A named argument leaves its own slot's field missing; the parity adapter compares that. Implement the oracle's behaviour.
- `accDescr` leak survives `mermaidAPI.reset()`: the parity adapter resets it per case.
- `Deployment_Node`/`Node` drop whatever lands in the sprite slot, named arguments included (`c4Db.ts:476`). Parity follows.
- Block's T0 is #552, PR #589, merged at ad3648a91.

## T3 (#540)

## T4 (#541)

- Block's T0 merged as #589 (`mermaid-v13` ad3648a91): `cylinderPadding*` (`cyx`, `cyy`) and `subroutinePadding*` (`srx`, `sry`) are core rows in `packages/core/src/theme/vocabulary.ts` with `usedBy: ['flowchart']` (plus block). T4 adds `'c4'` to `usedBy` on each row its sources read, nothing else in core. The integration branch merges `mermaid-v13` before T4 starts.
- v12 never draws a boundary's `$fontColor` (text always `#444444`, `svgDraw.ts:167,175`). Keep v12 (light themes v12-identical, D456); the boundary text reads `c4BoundaryColor`. List in MIGRATION.md only if v13 changes it.
- v13 flowchart shapes have no per-shape intersect functions (only `cyl` defines `shapeInset`); the router's outline clip (Pele `route.ts` `hit()`) lives in the package, with T3.

## T5 (#542)

## T6 (#543)

## T7 (#545)
