# Gaps (spec #291)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## Exploration findings (2026-11-05), see `01-v12-timeline.md` "Surprises"

### #308 T1 lexer
- [ ] #285's oracle is not committed yet. Timeline's v12 DB is a module namespace, so sequence's `db.constructor` trick for a fresh `yy` does not apply: the descriptor must reset it with `clear()` (owner #285; check when it lands).
- A period named `timeline` is rejected (jison's implicit `\b`): kept, the oracle decides.

### #336 T2 parser
- [ ] **Divergence to list:** v12's DB has no `setDiagramTitle`, so v12 drops a front-matter `title`. D218 draws it; the model-parity adapter lists it as a deliberate divergence.

### #338 T4a palettes
- [ ] v12's derivation differs per theme (forest derives as the spec says; default darkens twice and fixes slots 3–11; base and the neo/redux-dark themes darken by 25; dark and neutral use fixed lists; `cScaleInv` is `invert` in most themes and a 180° hue turn in default and forest; some `cScaleLabel` slots are special-cased). **Choice:** every theme's default values equal v12's exactly; under `primaryColor`/`secondaryColor`/`tertiaryColor` overrides the palette follows v12's rule wherever the DSL can express it (a small additive hue-rotation helper is allowed); any remaining difference is listed here.
- [ ] `cScale<n>` overrides are dropped today in every classic theme (no `cScale` list). T4a fixes it.

### #337 T3 layout
- [ ] v12 TD advances sections by `height − 2·30`, so consecutive sections overlap by 30 px. **Choice:** the spec's "no overlaps" invariant wins; TD sections do not overlap. MIGRATION.md row (owner #311).
- LR draws a connector for a period with no events; `disableMulticolor` does nothing when sections exist. Both kept (v12 behaviour).
- D251 says leading periods take slot 0 "as Pele does"; Pele actually paints them neutral. The decided answer (slot 0) stands.

### #311 T4 renderer
- [ ] v12's section classes are `section-<slot − 1>`: the first section is `section--1`. **Choice:** keep v12's numbering exactly, so existing author CSS still matches (P2); MIGRATION.md says so.
- Redux event label offset is `padding/2 + 3` in v12's code (the spec says `padding + 3`): follow the code (oracle).
- v12 TD writes no gradient defs, so its neo gradient CSS points at a missing id; v13's core defs make it draw (D182). MIGRATION.md row.

### #315 T5 integration
- [ ] Renderer fallbacks (`leftMargin` 50, `useMaxWidth` false) differ from the schema defaults (150, true). Use the effective v12 values with the default config merged (check in the oracle) and record any key whose effective value differs from its schema default.
