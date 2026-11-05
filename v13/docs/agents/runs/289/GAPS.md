# Gaps — spec #289

Unmet criteria, shared contracts and choices made without the maintainer, by owning ticket.

## Held (blocked outside this spec)

- [x] #285 merged into the integration branch from `feature/285_shared-jison-oracle` (PR #346, ready). T1 #300 is unblocked.

## #300 T1 lexer (from the exploration, `01-v12-quadrant.md`)

Quirks the spec does not list, probed on 12.2.0; each needs a named parity case:
- a trailing `%%` comment stays inside `title`, `accTitle` and `accDescr` text (`title T %% c` → `T %% c`);
- `quadrant-1 ""` is rejected (`string` mode pops before emitting STR);
- `:` never appears in unquoted text;
- `P:\n[0.1, 0.2]` and `quadrantChart x-axis A` on one line are accepted;
- `classDef a_b …` is rejected (classDef names exclude `_`), though `:::a_b` lexes;
- jison adds `\b` to bare word literals, so `titleCase: [0.1, 0.2]` is a point.

## #332 T3 layout (from the exploration)

- `oracle.parse(text, config)` resets config before `getQuadrantData()` runs, so builder parity must carry config through `%%{init}` in the text (or extend the oracle additively).
- ~~Configured `0` differs from v12~~: false. v12's `getQuadrantData()` re-applies `getConfig().quadrantChart` after the `||` defaults, so v12 honours `0` too (review of #332, probed). No MIGRATION entry.
- v12 point x/y reach the builder as strings coerced by d3; v13 parses them once (D226 for non-numbers).

## #309 T0 (merged)

- **Choice:** the CSS form clamps each channel, `rgb(from <c> clamp(0, r + R, 255) … / alpha)`, not a bare `calc()`, because relative colour syntax keeps out-of-range channels; this matches `lightenHsl` (D117). Offsets are plain signed numbers, accepted only as `adjust` arguments. Core gz +253 B (22,833 → 23,086).

## #332 T3 (merged; handoff `tickets/332.md`)

- [ ] **Owner #301 T2:** run the layout invariants and builder parity on parser-produced models: swap the parser's model in for `v12Quadrant(...).model` in `packages/conformance/src/quadrant/layout-parity.spec.ts`. T2 adopts `QuadrantModel` (`packages/diagram-quadrant/src/model.ts`): an axis statement sets only the labels it names (v12 merge), overridden statements get `st:<ordinal>` and draw nothing.
- [ ] **Owner #312 T4:** remove quadrant's `NOT_YET_DRAWN` exemption in `tools/gen-config/src/theme-used-by.spec.ts`; grow the viewBox for point labels (D224); `fill`/`stroke` undefined in the layout means `quadrantPointFill`.
- [ ] **Owner #317 T5:** drop `"private": true`, add the manifest, a `feat: first release` changeset and the `publish.spec.ts` entry.
- **Choices:** axis end labels get `ax:x/end` / `ax:y/end` so each drawn label has one AST id (pitfall 12). The square's width/height clamp at 0 (v12 wrote negative `<rect>` sizes for schema-valid tiny charts). Coordinates convert with `Number(text)` like v12's d3; a dropped point still counts as "has points" (v12 layout). Builder parity sets options with v12's `initialize()`, since 12.2.0's `getDiagramFromText` drops `%%{init}` config.
- Size: 2.0 KB gz (layout only).
