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
