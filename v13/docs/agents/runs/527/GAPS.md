# Gaps (spec #527)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Event modeling adds no core contract; no ASCII ticket (D320): `format: 'ascii'` throws `UnsupportedFormatError` (R-ASCII-5), asserted in T5.
- **T5 after T6.** T5 (#611) is blocked by T6 (#609) too, so the manifest's `language` key and the registry follow-ups land once, in T5 (treemap's order).
- **Theme table in T4.** The theme T0 (#414) is merged; T4 (#606) lands `src/theme/vocabulary.ts` with the renderer, T5 adds the oracle specs and `DIFFERENCES`.

## T1 (#600)

- **Comment lines kept.** v12's event modeling parsed `withComments` (`preserveCommentsWhenParsing`), so `%%` lines are EM_SINGLE_LINE_COMMENT tokens; `eventModelingView` keeps them without a core change, by replacing every `%` of each comment span in a same-length copy until core's view finds none.
- **For #611 (T5), a MIGRATION.md row:** v12 fell back to the comment-stripped text when `withComments` exceeded `maxTextSize` (50,000); v13 always keeps the comment lines.
- **Follow-up (for the maintainer, out of scope here: no core change in #527):** a `keepComments` option on core's `sourceView` would replace the copy-and-mask workaround in `eventModelingView` (agentflow also set `preserveCommentsWhenParsing` in v12).

## T1 (#600, merged)

- Review (orchestrator, `/code-review` plus a differential fuzz of ~27k sources against the oracle), fixed: comment lines holding U+2028/U+2029 followed by `%%` (every `%` of a comment span is now masked in `eventModelingView`'s second view, cases `comment-ls-*`/`comment-ps-*`); an unchecked `indexOf`; the line-separator stress shape; the CRLF variant on CRLF sources; `Kind.Space` out of the trivia set; the EM_YAML closer on the shared `indexOf` memo; build excludes.
- Accepted: comment lines are kept by a package-local view over core's `sourceView` (v12's `preserveCommentsWhenParsing`, `db.ts:685`). A `keepComments` option on core's `sourceView` would be cleaner, but the spec allows no core change: a follow-up for the maintainer.

## T2 (#602)

- **Model contract for T3, T4, T6** (`src/model.ts`, frozen, additive changes only, noted here): `frames` in source order `{ id (as written), reset, kind ('ui'|'pcr'|'cmd'|'rmo'|'evt'), keyword (as written), name (qualified, as written), sources (ids as written, repeats kept), dataRef?, data? { text (D523), type? }, astId }`; `entities`, `dataBlocks` (repeats kept; a reference reads the first), `notes`, `gwts` (D526: modelled, not drawn); `title?`/`titleAstId?` (D218, D524), `accTitle`, `accDescr` (D524), `warnings` (D525). A frame whose statement failed is not in the model.
- **Lanes, boxes and relations are derived, not modelled:** `eventModelStructure(model)` (`src/structure.ts`, exported) gives v12's lanes (index, label, band, namespace; D522: one per band and namespace), boxes (frame index, lane index, bold `name`, `data` text: a defined `[[ref]]` wins over inline, as v12) and relations (`source`/`target` frame indices, `inferred`, `astId` of the `->>` for explicit ones), in v12's order. Model parity checks them against v12's `getState()`; **T3 lays these out and must not rebuild them**.
- **For T3:** a frame may be its own source (`tf 01 ui A ->> 01`): v12 drew a relation from the box to itself; the structure keeps it (`source === target`). Namespace lanes take the band's next index in order of first use; past 99 namespaces in a band an index reaches the next band's default lane, as in v12 (not reachable in the corpus).
- **For T4 (and the maintainer):** D528's `relation:<source>-><target>` is the AST id of each `->> id` (a `Source` child of its frame, `@2` for a repeat). An inferred relation (no `->>`) has no AST node, since no statement wrote it: T4 gives its path `data-id` only, or the maintainer decides another id. Frame ids, data names and entity names are symbols (`frame`, `data`, `entity`); a repeated declaration is a reference, and a reference to a name nothing declares is left out (radar's D358). Statement spans: `header`, `frame`, `entity`, `data`, `note`, `gwt`, `title`, `accTitle`, `accDescr` (flat).
- **For T6:** no probe hooks yet (`tested()`, `PROBE_FOLLOWS`), as treemap's T2; the facet adds them. Folding: data blocks and `/* */` comments are single tokens (`T.DataBlock`, `T.BlockComment`).
- **Diagnostics (choices):** v12's thrown duplicate id is the error `EVENTMODELING_DUPLICATE_FRAME` at the second id, checked as soon as the id is read (so a frame that also fails later gives two errors). Syntax: `UNEXPECTED` (with hints for keyword names, `title`/`accTitle`/`accDescr` at a line start, upper-case keywords, part order, four-digit ids, block vs inline data, a second header), `UNEXPECTED_CHARACTER`, `UNCLOSED_DATA`, `UNCLOSED_STRING`. Recovery skips to the next statement keyword; a keyword met inside a line (`tf 01 evt data`) is skipped as the name it was meant to be. D525: one warning per kind at the first case, the others in `related` (wardley's pattern); `EVENTMODELING_INVALID_SOURCE` checks sources that name any frame, earlier or later (v12's validator resolved both), with its message verbatim (`a event` included).
- **Parity normalisation (`conformance/src/eventmodeling/v12.ts`):** v12's `getState()` runs against a stub document (text 0 × 1 px, so nothing wraps); positions and sizes are not compared (T3). Box text is v12's HTML as plain text, blank runs collapsed. D524 is applied to v12's raw title and accessibility values with the common converter's regexes; the AST lists' data text through Pele's `blockText`. 30 listed gate divergences plus 3 main-run rows (`divergences.json`, owner #602): D523 box text (`{a:1}`, quoted inline data: 7 sources × 3 variants), D522 (2 fixtures × 3) and core's unclosed directive (2 × 3).
