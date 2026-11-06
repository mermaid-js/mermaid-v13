# Gaps (spec #424)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #451 T1 lexer and corpus
- Exploration: the nested `10-full-example` has 6 columns, not 15; the 15-column case (D374's black columns) exists only flat, so the flat `10-full-example` is one of the two kept "columns only" variants.
- Exploration: v12 12.2.0 is commit `1fb786986` in this repo (the `mermaid@12.2.0` tag is only in the OSS clone); the kanban files equal `fa796a943`'s. The spec's Pele path does not exist locally (read at 3a2f075 via `gh api repos/obsidianmd/pele`).
- Exploration (oracle): an item whose text starts with the word `kanban`, any case, is rejected (`Kanban board` lexes `KANBAN`). Not in the spec's quirk list; follow the oracle.

## #453 T2 parser
- Exploration: the spec's "32 v12 specs" is the harvest count (29 distinct spec strings + 3 docs examples). `kanban.spec.ts` has 30 tests (two `parse` calls are commented out): T2 ports 30.
- Exploration (oracle): `shape: 5` throws in v12 (`toLowerCase` on a number). Treat it as the bad-`shape` semantic error.

## #455 T3 layout

## #457 T4 renderer
- Column colours (D374) wait for the Theme T0's T0a API (#414): the package `DiagramPlugin.theme` table and the `dark` trait.
- Exploration: khroma-style lighten/darken (`rgbToHsl`/`shiftHsl`/`hslToRgb`) is not exported from `@mermaid-js/core/theme`; `theme.dark` exists. **Choice (pending T0a):** use the T0 rule DSL's adjust if T0a provides one, else an HSL step inside the package; no core export (core size).
- Exploration: in v12 cards never get `look` (`kanbanDb.ts:76-91`; `insertNode` does not default it), so only columns were sketched and the priority bar was always drawn. D379 (decided) sketches columns *and* cards through `w.outline`. **For the maintainer:** D379's premise ("v12 sketches cards, drops the bar") is not what v12 ran; we follow D379 as decided.
- Exploration: `SvgWriter` already adds `rel="noopener noreferrer"` to `_blank` links. Kanban has no title/accessibility statements, so `-title`/`-desc` ids come only from front matter / config if core writes them.

## #463 T6 language facet
- Exploration: `LanguageFacet.standalone` (D289: rename changes one repeated id) exists only on `feature/294_mindmap` (#406). T6 starts after #406 merges into `mermaid-v13` and that is merged here; do not add a second copy of the core field.

## #459 T5 integration
- Waits for #414 T0a (theme table) as well as T4 and T6.

## #466 T7 ascii (Should)
