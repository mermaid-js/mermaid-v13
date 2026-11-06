# Gaps (spec #423)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Cynefin needs no core change of its own (it relies on #414's T0a) and has no ASCII output (D320).
- **Skeleton and model first.** The orchestrator landed the package skeleton and `CynefinModel` before T1 and T3 started, so the two run in parallel (as pie's `PieModel`).
- **Pele is not available on this machine.** Its fuzz fragment list (51 fragments, `tests/cynefin/oracle.test.ts`) and probe scripts (`scratchpad/specs/cynefin/probe/`) are not here; T2 builds its own fragment list from the spec's quirks.

- **For the maintainer: D362 and v13's default `idPrefix`.** v13's default `ctx.idPrefix` is an FNV-1a hash of text + config + options (`packages/mermaid/src/config-snapshot.ts:122-136`), so with no `options.id` the default seed is in effect a hash of the source (the option D362 did not take): two identical diagrams on one page get the same waves. Implemented as decided (hash `ctx.idPrefix`); pass an `id` to vary them.
- **Harvest from `fa796a943`.** That in-repo commit holds the same 12.2.0 cynefin sources as the tag, so harvest scripts read it, as the other ports do.

- **Theme table in T4.** T0a landed before T4 started, so T4 (which creates the plugin) declares the 15-variable `DiagramThemeTable` inline on it, per the spec's "v13 entries" and CONTRACT.md; T5 keeps the oracle specs, `DIFFERENCES`, MIGRATION.md theme rows and baselines.

## #461 T1 lexer

- Review (standards + spec) sent back: list the 21 undetected sources in the parity spec and fail on any new drop; gate the 16 integration-spec strings raw (whole-line `%%` reaches SINGLE_LINE_COMMENT); one stream helper for T2; a harvest drift check if cheap.
- Accepted deviations (for the maintainer): the lexer repeats pie's code for the `common.langium` terminals (sharing it is a core change); Pele's 12 oracle seeds are not harvested (not on this machine); the harvest pins `fa796a943` (identical to `mermaid@12.2.0` for these files); the line-separator cases are hand-written JSON cases, as in pie and quadrant; the changeset and `publish.spec.ts` entry for the new package are in T1 (they fix specs the skeleton turned red).
- [ ] `tools/gen-config/src/theme-used-by.spec.ts` is red since the skeleton (every diagram package must read a theme variable). Owner: orchestrator, at the T3 merge (add `cynefin` to the package list and to the `usedBy` of the shared variables it reads). Blocks pushing until then (the pre-push hook runs `pnpm check`).

## #465 T2 parser

## #467 T3 layout

## #468 T4 renderer

## #469 T5 integration

## #470 T6 language facet
