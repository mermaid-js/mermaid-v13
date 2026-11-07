# Gaps (spec #428)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Treemap adds no core contract; no ASCII ticket (D320).
- **T5 after T6.** T5 (#514) is blocked by T6 (#511) too, so the manifest's `language` key and the registry follow-ups land once, in T5 (radar's order).
- **Theme table in T4.** The T0 (#414) is merged, so the spec's pure-call fallback in core is not used. T4 (#505) lands `src/theme/vocabulary.ts` with the plugin; T5 adds the oracle specs and DIFFERENCES.
- **`cScalePeer` shape (D406).** Diagram tables have no palette kind (`ThemeVarKind`); core's palettes are core's. Treemap's `cScalePeer` is twelve colour variables `cScalePeer0`–`cScalePeer11` in its own table, each derived from the matching `cScale` slot by trait. The author-facing numbered names stay as in v12.
