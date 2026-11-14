# Whole-branch review fixes (spec #795)

Branch `feature/795_review-fixes` (on T7's D568–D574 records). Findings 1, 2, 3, 4, 5, 8, 9 fixed; 6 and 7 left as asked. Each fix had a failing test first.

**1. Arrowheads follow `lineColor` (D575, reverses the arrowhead parts of D569/D570).** `specs/default.ts` and `dark.ts` drop `arrowheadColor`, `base.ts` drops `rules.arrowheadColor`; the shared rule `lineColor` applies, as v12's `.marker`. Test: `conformance/src/flowchart-behaviour.spec.ts` "paints arrowheads in an author's lineColor under default/dark/base". Core `theme.spec.ts`/`themes.spec.ts` expectations follow. Oracle: new group D575 (`default`, `dark`, `base` × `lineColor:*` / `arrowheadColor`, 6), a variable-level difference that renders like v12. `migration/010-…` and `block.md:80` are right again; MIGRATION D569 row loses the arrowhead sentence, new D575 row. `forest`/`neutral` keep their pre-spec pins (GAPS).

**2. Gantt bar text (D574).** `taskTextColor` stays `textColor` in the classic family; new gantt variable `critTextColor` (`gct`): `taskTextColor` everywhere, `contrast(critBkgColor, taskTextColor, black)` in classic; `paint.ts` `labelColour` gives it to styled crit bars. `classic.dark` loses its `taskTextColor` override. Tests: `theme-contrast.spec.ts` `PROBED.gantt` (base + `{ primaryColor: '#1a237e', textColor: '#ffffff' }`; fails at 1.59:1 with T5's rule), `gantt/theme.spec.ts` "keeps bar text on the theme's text" (CSS `var(--_tx)`). `DIFFERS`: default `taskTextColor` → `#333333`; base matches v12 again. neo/neo-dark specs list `critTextColor` as v13-only.

**3. ER row ink live in CSS (D572).** Rule `contrast(rowX, contrast(rowX, ifSet(nodeTextColor, textColor), textColor), background)`: same JS values as T3's in every classic theme and probe (checked, incl. `nodeTextColor` probes), CSS chooses over `var(--_ro)`/`var(--_re)`. The review's shorter rule changed 31 values under an unreadable author `nodeTextColor` (Choice, GAPS). Test: `diagram-er` `table.spec.ts` "picks the row ink live over the row fill in CSS". Schema description and MIGRATION ER row updated.

**4. Dark note/cluster fill (D570).** `dark.ts` rules `noteBkgColor`/`clusterBkg: lightenHsl(mainBkg, 16%)` (v12 `secondBkg`), values unchanged at `#474949`. Test: `core theme.spec.ts` "derives dark's note and cluster fills from mainBkg". Oracle probes `mainBkg` (light, dark); it found base `nodeTextColor` under a dark `mainBkg` (added to D29) and forest `actorBorder` (new D576, listed not fixed).

**5. Gantt active outline** is `lineColor` directly (was `contrast(...)` resolving to it everywhere). Test: `gantt/theme.spec.ts` "outlines the active bar in lineColor". Comment and `migration/200-gantt-chart.md` updated.

**8.** `wardley/theme.spec.ts` header: stale dark `mainBkg` clause removed, reflowed.

**9.** #758's `#335577` probe dropped from `theme-contrast.spec.ts` (kept: `diagram-er` table unit check + `er-row-ink.spec.ts` render). Gantt #772 already has one of each (`theme-contrast.spec.ts` table pairs, `render-behaviour.spec.ts` render); kept.

**Records:** D568 (probes, counts: 289 = D29 50, D71 225, D571 6, D575 6, D576 2), D569, D570, D572, D574 edited; D575, D576 added. MIGRATION Themes rows (D569, D570, D575, D576, D29), ER geometry row, gantt fragment; `config.schema.yaml` notes; `pnpm regen`.

**Core gz:** 98,732 B before, 98,741 B after (+9; limit 99,328).

**Checks:** vitest (workspace) core theme, conformance, diagram-er/-gantt/-block/-flowchart/-state, tools/gen-config; gantt-utc + gantt-la; `pnpm typecheck`; eslint + prettier on changed files; `pnpm lint:spell`; `pnpm regen`, `check-generated-cli`: pass. Fallow audit exits 1 on one finding only, and it was there before these fixes (same result on the clean T7 head): `diagram-block` `render.ts` `drawNode` complexity "introduced" by #800 (12 → 22 cyclomatic). Not touched (block is outside these findings). `labelColour`'s crit branch went into a helper, `insideColour`, so gantt adds no complexity.

**Argos:** default/dark/base renders move only under a `lineColor` override; classic gantt default bar text goes `#000000` → theme text (`#333333` default) on normal bars; nothing else moves at the theme defaults.
