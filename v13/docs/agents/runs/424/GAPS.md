# Gaps (spec #424)

Unmet acceptance criteria and open choices, filed under the ticket that owns each one. Choices made without the maintainer (not covered by the spec or a D-id) are marked **Choice** and repeated under "For the maintainer" in the integration PR body.

## #451 T1 lexer and corpus
- Exploration: the nested `10-full-example` has 6 columns, not 15; the 15-column case (D374's black columns) exists only flat, so the flat `10-full-example` is one of the two kept "columns only" variants.
- Exploration: v12 12.2.0 is commit `1fb786986` in this repo (the `mermaid@12.2.0` tag is only in the OSS clone); the kanban files equal `fa796a943`'s. The spec's Pele path does not exist locally (read at 3a2f075 via `gh api repos/obsidianmd/pele`).
- Exploration (oracle): an item whose text starts with the word `kanban`, any case, is rejected (`Kanban board` lexes `KANBAN`). Not in the spec's quirk list; follow the oracle.
- **Choice:** the lexer's `Lexed.text(j)` (and so `kanbanTokens`) applies `kanban.jison`'s two action rewrites (`@{` reads `''`; `\n\s*` in a quoted run of shape data reads `<br/>`, and a run left open at the end gains one for v12's appended `\n`), so the gate has no image exclusion beyond the no-token kinds.
- **Choice:** every edge case is in `corpus/kanban-cases.json` (repo rule), not in TS arrays as mindmap's `EDGE_CASES`; the generated variants add CRLF, tabs, multi-line `@{` and a mid-line directive in every item line to mindmap's three.
- **Choice:** fixtures beyond the spec's list: the two 12.2.0 `packages/examples` boards, `theme-dark`/`theme-forest`, `section-width`, `priority-other-values`, `ticket-links`. New fixtures go in nightly-check; the two columns-only ones in pr-check beside the originals.
- Pele cross-check not done (not on this machine); the oracle decided every case.

## #453 T2 parser
- Exploration: the spec's "32 v12 specs" is the harvest count (29 distinct spec strings + 3 docs examples). `kanban.spec.ts` has 30 tests (two `parse` calls are commented out): T2 ports 30.
- Exploration (oracle): `shape: 5` throws in v12 (`toLowerCase` on a number). Treat it as the bad-`shape` semantic error.

## #455 T3 layout
- **Unmet (waits on #453):** the layout invariants run on hand-built `KanbanLayoutInput`s (`src/layout/fixtures.ts`, the corpus transcribed as T2 should read it), not on parser-produced fixtures. Once T2 merges: add the `KanbanModel` → `KanbanLayoutInput` adapter, build `FIXTURES` from `parseKanban` over copies of the corpus, and add `conformance/src/kanban/layout-corpus.spec.ts` on the files, as journey's.
- Exploration (v12 render): a card without metadata is `title + 20` (the empty ticket and assignee labels measure 0 high); see `tickets/455.md` for the numbers.
- Exploration: v12 wraps the ticket and the assignee at `W − 25` too, and a ticket or assignee over 40 px high (two lines or more) sticks out of the card's bottom, as the title then starts above the card. Kept as v12; not an invariant.
- **Choice:** the layout keeps v12's coordinates (column tops at `−1.5 W`, column k centred at `W·k + 5(k − 1)`); the bounds move the viewBox origin.
- **Choice:** `kanban.sectionWidth` and `kanban.padding` take a number or a whole numeric string from 0 to 10,000 px (v12's arithmetic took numeric strings); `sectionWidth: 0` is 200 silently (`|| 200`); a `sectionWidth` above 0 and below 26 px (`wrapInset + minWrap`: card labels keep 1 px to wrap at, cards 11 px wide) is raised to 26 (pitfall 22; v12 drew negative widths); anything else is the default. Each adjustment warns `KANBAN_CONFIG_IGNORED` once per key (mindmap's `MINDMAP_CONFIG_IGNORED`).
- **Choice:** lengths go through the render's unit profile (`fromPx`), so T7 can rerun the layout in cells; T7 may still want its own cell values.
- **Choice:** bounds include half the 1 px outline of columns and cards (journey's `drawnRects`), so the default viewBox is 1.5 px tighter per side than v12's (8 + 0.5 against 10).
- **Choice:** `KANBAN_PRIORITY` (D375) is raised by T4, not by the layout.
- **Choice:** the layout reads `fontFamily`/`fontSize` (pitfall 16), so `kanban` joins core's `TEXT_USERS` in this ticket and `NOT_RENDERING_YET` in `theme-used-by.spec.ts` is emptied, not in #457.
- **Choice:** the length-literal scan is `packages/conformance/src/kanban-layout-literals.spec.ts` (the diagram packages have no Node types), outside `src/layout/`.

## #457 T4 renderer
- Column colours (D374): T0a (#438) is merged into this branch (`d562508ea`). **Choice:** twelve table vars (one per `cScale` slot, used for column k as slot `(k + 1) mod 12`) whose `rules.light` is `lightenHsl(cScale<n>, 10%)` and `rules.dark` `darkenHsl(cScale<n>, 10%)` (khroma's lighten/darken, as v12's `styles.ts`), so `cScale<n>` overrides recolour columns and there is no HSL code in the package or core. "No new variable" in D374 is read as no new *core* variable.
- Exploration: in v12 cards never get `look` (`kanbanDb.ts:76-91`; `insertNode` does not default it), so only columns were sketched and the priority bar was always drawn. D379 (decided) sketches columns *and* cards through `w.outline`. **For the maintainer:** D379's premise ("v12 sketches cards, drops the bar") is not what v12 ran; we follow D379 as decided.
- Exploration: `SvgWriter` already adds `rel="noopener noreferrer"` to `_blank` links. Kanban has no title/accessibility statements, so `-title`/`-desc` ids come only from front matter / config if core writes them.

## #463 T6 language facet
- Exploration: `LanguageFacet.standalone` (D289: rename changes one repeated id) exists only on `feature/294_mindmap` (#406). T6 starts after #406 merges into `mermaid-v13` and that is merged here; do not add a second copy of the core field.

## #459 T5 integration
- Waits for #414 T0a (theme table) as well as T4 and T6.

## #466 T7 ascii (Should)
