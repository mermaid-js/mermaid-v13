# GAPS: spec #290 (user journey port)

Unmet acceptance criteria, open contracts and decisions taken without the maintainer, under the ticket that owns each one.

## Shared contracts

- `JourneyModel` (`packages/diagram-journey/src/model.ts`) is landed by T3 #303, which starts first on hand-built models, with the exact shape in the spec's "Parser (T1, T2)" section. T2 #302 produces it and owns any change; a change goes here first.
- Landed by #303 with the spec's fields plus AST ids: `sections: { ast, name }[]` (`s:<name>`, `s:<name>@2`), `tasks: { ast, name, score, people, section, sectionIndex? }[]` (`t:<n>` from 1), `actors`, `title?`, `accTitle`, `accDescr`, `warnings`. `sectionIndex` (index into `sections` of the line the task follows, undefined before the first) is additive: with repeated names, `section` alone cannot give a band its AST id. T2 fills it.

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

- Unmet until T2 merges: the invariants run on hand-built fixtures (`src/layout/fixtures.ts`, one per corpus model plus edge cases); T2 swaps `FIXTURES` for parser output on the `.mmd` files.
- Decided in T3: D242's margin is `leftMargin + ` the widest legend line, always. At default config this moves the tasks, bands, title and activity line right by the widest actor name (about 20 px for `Me`), so "v12 positions at default config" holds for every y and for spacing, not for that x offset. For the maintainer: `max(leftMargin, …)` would keep v12's x for short names but brings a threshold back.
- Decided in T3: legend label at x `40 + 2 × boxTextMargin` (v12's tspan, 50 at default), first baseline 7 below its dot. Legend font is the theme `fontFamily`/`fontSize` (v12 `.legend`). A row advances by `max(20, room for its dot and label)`: one-line rows keep v12's 20, wrapped rows step by core's line height instead of 20 per line. `<br>` breaks in the legend too (v12 replaced it with a space; D225).
- Decided in T3: task names wrap to `width`, section names to their band, legend names to `maxLabelWidth`; the title does not wrap (breaks at `<br>` only). Task and band boxes keep `height`; a taller label overflows the box (v12 kept the box) and the bounds hold it. Section names use the task font (v12 drew both in `taskFontSize`/`taskFontFamily`).
- Decided in T3: the `''` actor's dot leaves no gap: a task's dots are packed over its named mentions, 14 px then every 10 px.
- Decided in T3: the activity arrow's tip is a `taskMargin` past the last task's right edge (v12's position at default config; v12's formula went through `diagramMarginX`), the stroke ends one stroke width short of it; with no tasks the tip is `left + taskMargin`. The head is v12's marker path scaled by the stroke width, as a filled path in the layout.
- Decided in T3: bounds are what is drawn (strokes included) with `diagramMarginX` on both sides and `diagramMarginY` above and below. v12 had no left margin, a fixed -25 top and +70 for a title. Every task line reaches y 450 (the score-0 place), so the bottom is 460 unless the legend is taller.
- Decided in T3: `JOURNEY_SCORE` is raised by the layout (so once per render), when any score is `NaN` or outside 0–5, naming up to five tasks. T2 raises none for scores.
- Decided in T3: tasks before the first section have no band and slot 0 (v12 `task-type-0`, fill `#CCC`; T4 picks the fill).
- Decided in T3: a `journey` length key replaces its default only as a finite number ≥ 0; anything else keeps the default without a warning (T5 owns config validation).
- Decided in T3: with `height` above about 145 the task box sits below the score-5 face, as in v12; the task line then starts at the box (`y2 = max(450, task y)`).

## #319 T4 renderer

## #327 T5 integration

## #331 T6 language facet
