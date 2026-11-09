# Gaps (spec #527)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Event modeling adds no core contract; no ASCII ticket (D320): `format: 'ascii'` throws `UnsupportedFormatError` (R-ASCII-5), asserted in T5.
- **T5 after T6.** T5 (#611) is blocked by T6 (#609) too, so the manifest's `language` key and the registry follow-ups land once, in T5 (treemap's order).
- **Theme table in T4.** The theme T0 (#414) is merged; T4 (#606) lands `src/theme/vocabulary.ts` with the renderer, T5 adds the oracle specs and `DIFFERENCES`.

## T1 (#600)

- **Comment lines kept.** v12's event modeling parsed `withComments` (`preserveCommentsWhenParsing`), so `%%` lines are EM_SINGLE_LINE_COMMENT tokens; `eventModelingView` keeps them without a core change. v12 fell back to the stripped text above `maxTextSize`; v13 does not (for the maintainer: a MIGRATION.md row in T5 if wanted).
