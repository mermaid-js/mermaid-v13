# Gaps and choices, spec #522

Unmet acceptance criteria and choices not covered by the spec or a D-id, per owning ticket. Each choice is also listed under "For the maintainer" in the PR body.

## T1 (#538)

- `.*direction` rules come first in v12's lexer: any line containing `direction LR`, even inside a quoted label, is a lexer reject (01 note). **Closed (#538):** the lexer stays v12's, so a quoted `direction TB` stays one `Direction*` token and #539 reports it as D452's `direction` diagnostic; no gate exclusion. Choosing to let the label through instead is a lexer change and a gate exclusion for #539.
- **Closed (#538):** D452's other lexer-visible items (unquoted argument stopping at `)` and line ends, `%%` keeping its line break, lone `title`) are not in the T1 lexer; #539 implements them and lists each lexer change as a gate exclusion in `conformance/src/c4/lexer-parity.spec.ts`.
- The syntax page shows its C4Context example twice; the docs fixtures are five files (`nightly-check/docs/`), the harvest keeps all six strings.

## T2 (#539)

- **Spec correction (oracle wins, pitfall 29):** the spec says named arguments "fill the slot they land in, not the slot they name". v12's `assignAttributes` (`c4Db.ts:31–51`) sets the field the name gives (`bag[key]`) everywhere except the alias/label slots (raw object stored, D452 changes that) and `UpdateLayoutConfig` (by position). `UpdateRelStyle`'s `parseInt` still reads by slot (`$textColor` in slot 5 → `NaN`, `$offsetX` in slot 3 stays `"5"`). A named argument leaves its own slot's field missing; the parity adapter compares that. Implement the oracle's behaviour.
- `accDescr` leak survives `mermaidAPI.reset()`: the parity adapter resets it per case.
- `Deployment_Node`/`Node` drop whatever lands in the sprite slot, named arguments included (`c4Db.ts:476`). Parity follows.
- Block's T0 is #552 (open at 521fb76ee).

## T3 (#540)

## T4 (#541)

- v12 never draws a boundary's `$fontColor` (text always `#444444`, `svgDraw.ts:167,175`). Keep v12 (light themes v12-identical, D456); the boundary text reads `c4BoundaryColor`. List in MIGRATION.md only if v13 changes it.
- v13 flowchart shapes have no per-shape intersect functions (only `cyl` defines `shapeInset`); the router's outline clip (Pele `route.ts` `hit()`) lives in the package, with T3.

## T5 (#542)

## T6 (#543)

## T7 (#545)
