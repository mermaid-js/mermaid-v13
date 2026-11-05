# GAPS: spec #290 (user journey port)

Unmet acceptance criteria, open contracts and decisions taken without the maintainer, under the ticket that owns each one.

## Shared contracts

- `JourneyModel` (`packages/diagram-journey/src/model.ts`) is landed by T3 #303, which starts first on hand-built models, with the exact shape in the spec's "Parser (T1, T2)" section. T2 #302 produces it and owns any change; a change goes here first.

## Spec errata (found in exploration, source wins)

- Corpus split is 11 `pr-check` / 7 `nightly-check` (spec says 12 / 6); 18 files either way.
- A score of `7` does not overlap the task box: `cy = 300 + (5 − 7)·30 = 240`, box spans y 110–160 (`svgDraw.js:218`); overlap needs a score above about 9.2. D226's clamp to 0–5 still applies.
- In v12 `fo` mode the tspan fallback has no `sectionColours` fill (`svgDraw.js:370`); it shows only with `textPlacement: 'tspan'`. D225 (honour `sectionColours` only when set) is unaffected.
- `sectionFills`/`sectionColours` were read once at module load (`journeyRenderer.ts:281-282`), so per-diagram values never applied in v12.

## Open across tickets

- **Hue rotation for `fillType2`–`fillType7` (T5).** v12 derives them with khroma `adjust(primary, {h: ±64/128})`; the v13 theme DSL has no hue function (quadrant's T0 #309 adds an RGB-channel `adjust` only). Decided: per-theme literal values equal to v12's computed defaults, so no core change (spec: "No core change is expected"). Cost: a theme with a custom `primaryColor` does not re-derive the fills as v12 did. For the maintainer: a `hue(a, deg)` DSL function would restore it; pie (v12 `pie1`–`pie12` also hue-rotate) may want the same.
- **Legend order (T3).** v12 walks `Object.keys(actors)`, so integer-like actor names come first while colours follow the sorted order. Decided: legend in the model's sorted `actors` order, colours by the same index (consistent with D244); MIGRATION row in T5.
- **Bands (T3).** v12 opens a band when consecutive tasks change section, not per `section` line, so tasks before the first section get no band and empty sections draw none. Keep v12.
- **CSS gating (T4/T5).** v12 gates every `fillType1`–`7` rule on `fillType0` being set (`styles.js:93-116`). Irrelevant in v13: each slot reads its own variable.
- **`useMaxWidth`/`useWidth` (T5).** Base config keys; journey re-declares them with its own status as sequence does (schema L3336-3338).
- **Oracle descriptor (T1).** The v12 journey DB is a plain module object, not a class: the #285 descriptor must pass the object and call `clear()`, not `new db.constructor()`.

## #310 T1 lexer gate

- Blocked by #285 (shared jison oracle).

## #302 T2 grammar, parser, model, AST

## #303 T3 layout

## #319 T4 renderer

## #327 T5 integration

## #331 T6 language facet
