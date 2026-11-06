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
- Exploration (oracle): `shape: 5` throws in v12 (`toLowerCase` on a number). Treat it as the bad-`shape` semantic error. Done: any truthy non-string `shape` (`5`, `true`, a list) is `KANBAN_SHAPE`.
- Exploration (oracle): the only "not a mapping" v12 rejects is `null` (`@{⏎}`, `@{⏎ null⏎}`); a scalar or list (`@{⏎ hello⏎}`, `@{⏎ - x⏎}`) is accepted and ignored. **Choice:** follow the oracle: `KANBAN_DATA_EMPTY` for `null` only, other non-maps ignored silently (the spec's "non-mapping data" read as v12's `TypeError` case).
- **Choice:** `priorityKind: 'other'` keeps the value's JSON text (`[1,2]`, `true`), which is YAML; the spec says "the YAML text". `'text'` for a YAML string.
- **Choice:** the misplaced-indent message starts with v12's (`Items without section detected, found section ("b")`), then a hint, as mindmap's second-root message; one diagnostic per shallow item that another item follows, `related` at that item; diagnostics are sorted by position, since it is known only at the next item.
- **Choice:** entities in shape data (`ticket: #35;`) are read as v12's placeholders, so `#` starts no YAML comment and `&` no anchor, then turned back into `&#35;`.
- Core YAML gaps (listed divergences, not kanban): `parseYaml` reads `[1⏎2]` as `['1 2']` where js-yaml 4 rejects it, and rejects a tab-indented scalar document js-yaml read. Only generated variants hit them. A fix is a core change (kanban T0 / maintainer).
- `gen-grammar`'s `unnamed` kind map gains an optional `terminal`, so the lexer's four `SHAPE_DATA` kinds map to their own rules (additive; flowchart and the others unchanged).

## #455 T3 layout

## #457 T4 renderer
- Column colours (D374): T0a (#438) is merged into this branch (`d562508ea`). **Choice:** twelve table vars (one per `cScale` slot, used for column k as slot `(k + 1) mod 12`) whose `rules.light` is `lightenHsl(cScale<n>, 10%)` and `rules.dark` `darkenHsl(cScale<n>, 10%)` (khroma's lighten/darken, as v12's `styles.ts`), so `cScale<n>` overrides recolour columns and there is no HSL code in the package or core. "No new variable" in D374 is read as no new *core* variable.
- Exploration: in v12 cards never get `look` (`kanbanDb.ts:76-91`; `insertNode` does not default it), so only columns were sketched and the priority bar was always drawn. D379 (decided) sketches columns *and* cards through `w.outline`. **For the maintainer:** D379's premise ("v12 sketches cards, drops the bar") is not what v12 ran; we follow D379 as decided.
- Exploration: `SvgWriter` already adds `rel="noopener noreferrer"` to `_blank` links. Kanban has no title/accessibility statements, so `-title`/`-desc` ids come only from front matter / config if core writes them.

## #463 T6 language facet
- Exploration: `LanguageFacet.standalone` (D289: rename changes one repeated id) exists only on `feature/294_mindmap` (#406). T6 starts after #406 merges into `mermaid-v13` and that is merged here; do not add a second copy of the core field.

## #459 T5 integration
- Waits for #414 T0a (theme table) as well as T4 and T6.

## #466 T7 ascii (Should)
