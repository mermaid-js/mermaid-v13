# Gaps (spec #520)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #560 T1 lexer and corpus
- Note (exploration): the parser spec has 37 `it` plus one `test.each`, 43 run tests (the spec says 38); the DB spec 10, the syntax page 9 examples. Corpus 172 files as the spec says.
- Note: Pele's source is not on this machine (`/Users/knsv/repos/pele/` is absent); only `pele@1.13.0`'s dist is under `packages/bench/node_modules/pele/dist`. It stays a reference only (D325).

## #564 T2 parser
- Open: core's render `Warning` has no `related` (`WARNING_KEYS`, `packages/core/src/errors.ts:16`). D433's `REQUIREMENT_STYLE_DROPPED` lists the lost statements through `astIds`, as sankey's D394 warning did (#496, `SankeyWarning`); the parse diagnostic keeps `related`. No core change.
- Open: only `visual-check/with-a-title*.mmd` is still a rejection fixture: `packages/core/src/preprocess/preprocess.spec.ts:98-100` records that v13 accepts `visual-check/with-a-theme-default.mmd`. List it as a divergence with that reason.

## #570 T3 layout

## #574 T4 renderer

## #579 T6 language facet

## #587 T5 integration
- Open: core writes `linkLabelBkg` only in redux-color and redux-dark-color, so D435's `inline(linkLabelBkg, edgeLabelBackground)` gives `#cccccc` (redux) and `#474949` (redux-dark), where v12 requirement draws `#FFFFFF` / `#16141F` in all four redux themes. Give `relationLabelBackground` a redux family value (light and `dark`) in the package table, or list the two in `DIFFERENCES`; prefer the family value (D435 says equal v12).
- Open: v12's renderer reads spacing, `titleTopMargin` and `useMaxWidth` from `state.*`; v13 reads the `requirement` section (class's precedent, spec). MIGRATION.md row. v12's defaults draw the 24 config-free corpus files as `redux-color`/neo.
- Open: tests use requirement as "the unsupported type": `packages/mermaid/src/api.spec.ts:86-94, 214, 606`, `packages/mermaid/src/cli.spec.ts:220-228`. Move them to a type no M5b port ships (check `registry.gen.ts` and the open M5b specs first; other ports may make the same edit).

## #588 T7 ASCII
