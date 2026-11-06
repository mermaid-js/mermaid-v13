# Gaps (spec #423)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Cynefin needs no core change of its own (it relies on #414's T0a) and has no ASCII output (D320).
- **Skeleton and model first.** The orchestrator landed the package skeleton and `CynefinModel` before T1 and T3 started, so the two run in parallel (as pie's `PieModel`).
- **Pele is not available on this machine.** Its fuzz fragment list (51 fragments, `tests/cynefin/oracle.test.ts`) and probe scripts (`scratchpad/specs/cynefin/probe/`) are not here; T2 builds its own fragment list from the spec's quirks.

- **For the maintainer: D362 and v13's default `idPrefix`.** v13's default `ctx.idPrefix` is an FNV-1a hash of text + config + options (`packages/mermaid/src/config-snapshot.ts:122-136`), so with no `options.id` the default seed is in effect a hash of the source (the option D362 did not take): two identical diagrams on one page get the same waves. Implemented as decided (hash `ctx.idPrefix`); pass an `id` to vary them.
- **Harvest from `fa796a943`.** That in-repo commit holds the same 12.2.0 cynefin sources as the tag, so harvest scripts read it, as the other ports do.

- **Theme table in T4.** T0a landed before T4 started, so T4 (which creates the plugin) declares the 15-variable `DiagramThemeTable` inline on it, per the spec's "v13 entries" and CONTRACT.md; T5 keeps the oracle specs, `DIFFERENCES`, MIGRATION.md theme rows and baselines.

## #461 T1 lexer (merged)

- Review fixes landed (`bb4197bc6`): `NOT_DETECTED` (21 sources, reasons, exact-set assertion), raw integration-spec strings gated via `lexText`/`cynefinVerbatimTokens`, `lexCynefin(src)` stream helper for T2, harvest drift spec.

- Review (standards + spec) sent back: list the 21 undetected sources in the parity spec and fail on any new drop; gate the 16 integration-spec strings raw (whole-line `%%` reaches SINGLE_LINE_COMMENT); one stream helper for T2; a harvest drift check if cheap.
- Accepted deviations (for the maintainer): the lexer repeats pie's code for the `common.langium` terminals (sharing it is a core change); Pele's 12 oracle seeds are not harvested (not on this machine); the harvest pins `fa796a943` (identical to `mermaid@12.2.0` for these files); the line-separator cases are hand-written JSON cases, as in pie and quadrant; the changeset and `publish.spec.ts` entry for the new package are in T1 (they fix specs the skeleton turned red).
- [x] `tools/gen-config/src/theme-used-by.spec.ts` was red since the skeleton; closed by #467 (cynefin reads `fontFamily`). Was: (every diagram package must read a theme variable). Owner: orchestrator, at the T3 merge (add `cynefin` to the package list and to the `usedBy` of the shared variables it reads). Blocks pushing until then (the pre-push hook runs `pnpm check`).

## #465 T2 parser

- Review sent back: parser/convert stress spec; narrow the fuzz's directive exemption to the core difference; recovery cases with N>1 errors and every rule name in the no-names check; `getConfig` compared with the oracle (or skipped with a reason); ebnf lexer-input prose; one domain-name source, no silent fallbacks, clearer names.
- Accepted deviations (for the maintainer):
  - **Core directive reading differs from v12 (every type).** v12 ends a `%%{` directive at the first line break with no `}%%`, and an unclosed `%%{ word` cuts the rest of the text; core runs a directive to its `}%%` across lines and reads a bare `%%{` as a comment. The fuzz exempts those mutants and the gates exclude `unclosed-directive-*`, as for pie.
  - header AST id is `header`; recovery expectations are `errors`/`keeps` fields on `cynefin-cases.json` items; 63 fuzz fragments of our own (Pele's 51 not here); `convert.ts` repeats pie's value conversion and `parser.ts` pie's id escaping (core's `AstIds` could own them); `detectCynefin` matches the text v12's `detectType` saw (directives inside the header word removed, `cynefin-beta%%` + line break accepted); the v12 boundary cases run in T2 through v12-named wrappers on T3's generator; symbols and statements (D367) are built by the parser.
  - Recovery jumps to the line end after a lexer error, so `complex "a" ; "b"` reports one error and keeps neither `"b"` nor anything after it on that line (v12 rejects the whole text).
- [ ] **#469:** render spec for the D218 front-matter title (only a parser unit spec until the manifest).

## #467 T3 layout (merged)

- Review fixes landed (`fc356a3b7`): `Math.hypot` and a canvas that is not finite (×16 headroom) counts as invalid; `cynefin.fixtures.ts`; `CANVAS.half/quarter` gone; `CynefinFont` carries `style` (subtitles italic).
- `cynefin` now in `theme-used-by.spec.ts`, so the skeleton's red spec is closed.

- Review sent back: NaN/Infinity at huge finite config (`width: 1e200`, 1e308): `Math.hypot`, and a canvas that is not finite counts as invalid (D366 fallback + warning); `fixtures.ts` ships in dist; unused `CANVAS.quarter`; the subtitle's italic style recorded in the layout.
- Accepted deviations (for the maintainer): one `CYNEFIN_CONFIG_INVALID` per invalid key (D366 "Each gets one"); a non-number config value (string, null, object) counts as invalid; a NaN `boundaryAmplitude` takes the default 8, ±Infinity clamps; extra lines of a title or transition label grow upward (last line at v12's anchor); config defaults in `metrics.ts` (`CYNEFIN_DEFAULTS`) until T5 generates them; `markdownString` copied from pie (a core helper would be a core change); `cynefin` added to `fontFamily`'s `usedBy`.
- [ ] **#465:** enable `conformance/src/cynefin/layout-corpus.spec.ts` (skipped until the package exports `parseCynefin(source) → { model }`; change that one lookup if T2 names it differently).
- [ ] **#468:** replace `src/theme/stand-in.ts` (v12's five lengths, theme ignored) with the T0a table's variables.

## #468 T4 renderer

## #469 T5 integration

## #470 T6 language facet
