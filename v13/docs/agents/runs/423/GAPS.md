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

## #465 T2 parser (merged)

- Review fixes landed (`7f6798642`): `parser-stress.spec.ts` (20 shapes; v12's `/\s+$/gm` fails it at 64x); fuzz exemption narrowed to unclosed/multi-line directives and one-line directives v12's `directiveRegex` cuts short (`%%{init: x{}}%%`), exempt count asserted < 3%; 31 recovery cases, 5 with N>1; every capitalised rule name in the no-names check (`cynefin`, `ended` are words in messages); `getConfig` skipped until #469; ebnf prose (a lone CR is a lexer error only in text handed straight to Langium: v12's preprocessing turns it into LF).
- **Additive model change:** `CYNEFIN_DOMAIN_NAMES` in `model.ts`, `CynefinDomainName` derived from it (same union).

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
- [x] **#465:** enable `conformance/src/cynefin/layout-corpus.spec.ts` — closed by #465 (runs and passes). Was: (skipped until the package exports `parseCynefin(source) → { model }`; change that one lookup if T2 names it differently).
- [x] **#468:** replace `src/theme/stand-in.ts` (v12's five lengths, theme ignored) with the T0a table's variables — closed by #468 (`src/theme/lengths.ts` reads `theme.number('cynefin…')` from the plugin's table).

## #468 T4 renderer (merged)

- Review fixes landed (`cf4dad268`): `CYNEFIN_PAINT` by name; `CynefinItemBadge.id` (additive layout field) carries the item's `data-id`; the `+N more` badge has neither `data-id` nor `data-ast`; the table in `src/theme/table.ts`; nested/flat override tests under default, dark and redux, the dark entry for `redux-dark-color`; the v12-spec adapter uses `DEFAULT_THEME`.

- Review sent back: the one-letter paint bag (pitfall 18); item `data-id` carried on the layout; no `data-id` on the `+N more` badge; the theme table in `src/theme/table.ts`; nested/flat override tests under `dark` and `redux`, the dark entry for `redux-dark-color`.
- Accepted deviations (for the maintainer):
  - **Core `usedBy` metadata:** `cynefin` added to the `usedBy` of `lineColor`, `textColor` and `primaryTextColor` (and `fontFamily`, #467), as `theme-used-by.spec.ts` requires for the table's rule inputs. No cynefin rows in core; `v13/docs/theme-variables.md` regenerated.
  - **Dark keys on the theme's dark trait**, not the author's `darkMode` (v12's literals ignore `darkMode`), so `darkMode: true` on a light theme keeps the light backgrounds.
  - **Forest** takes the light entry (default's literals, not v12 forest's `#C8E6C9`… and cliff `#8B4513`): no trait separates forest from default and a shared input is a core change (D541 approximation). Owner of the `DIFFERENCES` entry and MIGRATION.md row: #469.
  - Renders before the manifest use `createMermaid()` + `registerExternalDiagrams([cynefin], { lazyLoad: false, replace: true })` (`conformance/src/cynefin/render-api.ts`), as pie's T4; `mermaid/slim` refuses a detector row with no plugin id.
  - `<style>` only for the `auto` theme, as pie and quadrant; `openRoot`/`textElement` copied from pie/quadrant (third copy, a core helper candidate); font weight written `bold`.
  - Pitfall 17: v12 12.2.0's computed styles in Chromium, 11 themes, with and without `look: neo`: only colours and `fontFamily` differ (no filter, gradient or shadow).
- Size: `.` 13.1 kB gz (was 10.8 kB before the renderer).
- **Additive layout change:** `CynefinItemBadge.id` (the item's label as written), the item `g`'s `data-id`, so the renderer reads no model to label items.

## #469 T5 integration (merged)

- Review sent back: the `registry.ts` cleaned-text detection fallback over-accepts (`cynefin-beta%% c` with no line break, `usecase-beta%% x`: v12 rejects both) — use v12's detection cleaning, and a registry spec over every first-party row against the oracle's `detectType`; the language bench's 50k source as a committed `.mmd`.
- Fixes landed (`a9f00e6d1`): fallback on v12's exact detection text (`v12-detect-text.ts`: v12's `directiveRegex` as a linear scanner + `stripAnyComments`); `conformance/src/detection.spec.ts` over all 37 rows vs v12's `detectType` (7 header cases each, 3 order cases, 3,000 seeded mixes); one listed divergence, `flowchart LR⏎  %% C4Container` (c4 in v13, flowchart-v2 in v12, from the raw-first order that predates this change); bench 50k source committed as `packages/bench/fixtures/language/cynefin-50k.mmd`. Cost: core 93,051 B gz (+432 B over 92,619: 23 B the row, 409 B the module). Sent back once more for size; final (`f6f72ff71`): no new module, `detectText` with a flag that leaves a `%%` on the last line alone (v12's `stripAnyComments` without a following line break); core 92,688 B gz (+69 B: 23 B the row, 46 B detection). Sizes measured: full v12 text 93,051; comments-only port 92,778; final 92,688. New listed divergences ("v12's directive cut before detection is not reproduced in core (size, R-PERF-8)"): three keywords split by a directive v12's regex cuts differently (two value words, a lone CR, U+2028); v12 rejects, v13 detects. Exempt seeded classes: 141 unclosed directives, 118 raw-body matches, 273 where v12's directive regex removes a different span.
- Accepted (for the maintainer): **first-party detection retries v12's cleaned text when the text contains `%%`** (`packages/mermaid/src/registry.ts`), needed for `cynefin-beta%% c⏎…` parity; it applies to every first-party row, as v12's detection did. Core +24 B gz (23 B the registry row, 1 B the fallback): 92,643 of 94,208. The table stays in `src/theme/table.ts` (T0b's `vocabulary.ts` convention not landed). The config oracle passes config to v12 through `initialize` (v12's `getDiagramFromText` reads no directives or front matter).
- Results: warm render 11.9× v12 (geomean over 29 fixtures, 7.5–20.8×; machine load ~20); cynefin chunks 17.8 kB gz, one cynefin render loads 110.4 kB gz; `language:cynefin` 4.7 ms median per 50k-character cycle (budget 15 ms). `pnpm e2e` 1791 passed, 6 failed under load (5 `dev/compare-tab` "Page crashed", the webpack `platform/bundler-plugin` case); both files 21/21 alone.

- [ ] Un-skip the ported `getConfig` v12 spec ("config honoured in #469 T5") and compare with the oracle's `getConfig()`.

## #470 T6 language facet (merged)

- Review fixes landed (`be0928840`): undeclared domains have no definition; `FIXED_NAMES` pins the D367 refusal message; a meaning line per domain in hover; no source domain after `-->`; `listOf` reused; `DOMAIN_META` imported from `src/domains.ts` (`layout/meta.ts` keeps only `domainTitle`).
- **Additive core change (for the maintainer):** optional `declaredOnly?: boolean` on `LanguageFacet` (`packages/core/src/parser-kit/language.ts`), read by the language service's definition, references and semantic tokens (`symbols.ts`, `snapshot.ts`, `semantic-tokens.ts`). When set, only a `def` occurrence defines a symbol. D367 needs it ("Its definition is the first block"), and the service's "first mention defines" fallback otherwise gives a transition-only domain a definition. Every other facet is unchanged. The spec says "no core change of its own"; this is the smallest change that meets D367.

- Review sent back: undeclared domains (named only in transitions) must have no definition (D367); pin the D367 refusal reason in the rename round-trip; a meaning line per domain in hover (v12 docs); no source domain after `-->`; reuse `listOf()`; drop the `layout/meta.ts` re-export.
- **Rename gate mechanism (for the maintainer):** `packages/language-service/src/rename-round-trip.spec.ts` gains `FIXED_NAMES` (cynefin): every cynefin rename must be refused with the D367 reason and at least one refusal must occur, instead of listing ~38 refusals in `KNOWN_REFUSALS`. Owner: #470.
- Accepted deviations (for the maintainer): `prepareRename` still returns the name's range and only `rename` refuses (the facet contract has no per-kind refusal at prepare time; adding one is a core change); after a transition target, `:` is offered and `"` only after the `:` (the grammar's order); domains and statements are offered at line start (and domains after `-->`) only; the parser's diagnostics are now sorted into source order; `DOMAIN_META` moved to `src/domains.ts` so `./language` holds no layout code; `cynefin-beta` joins five other types' empty-text completion goldens.
- [ ] **#469:** `LEZER_HIGHLIGHTERS`/`MONARCH_HIGHLIGHTERS` rows, each adapter's `gen`, `adapters-agree.spec.ts`, first-paint specs (language.md step 9); drop the unlisted-facet row and the eager row in `service-symbols.spec.ts`; a `bench language:cynefin` script.
