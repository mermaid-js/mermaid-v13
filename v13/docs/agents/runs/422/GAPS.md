# Gaps (spec #422)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Radar adds no core contract (the theme table and the `radar` section come from #414 T0a); no ASCII ticket (D320).
- **Theme stand-ins until T0a.** T3/T4 read the ten `radar*` variables through one stand-in module with v12's defaults; T5 deletes it when the package theme table lands. No radar row goes into core's vocabulary (R-PERF-8), so the spec's pure-call-rows fallback is not used unless T0a slips past T4.

## Shared contracts

- **`RadarModel`** (`packages/diagram-radar/src/model.ts`): landed by the orchestrator before #446 and #447 started in parallel, shaped from the spec's model list. #446 produces it; #447 reads it. Change it only additively and note the change here.
- **Package skeleton** (`packages/diagram-radar`, private, no manifest until #449): landed with the model. #445 adds the lexer to it.

## T1 (#445, merged)

- Review (orchestrator): no hard standards violations. Accepted judgement calls: the lexer plumbing mirrors pie's (extract a parser-kit base if a third Langium lexer copies it); `radar/corpus.ts` imports `commented` from `../sequence/corpus.ts`, as pie's does.
- **For the maintainer (core, not radar): indented front matter closed at column 0.** `dev-diagrams/knsv/knsv2-03-radar.mmd` opens its fence with six spaces and closes it at column 0. v12 never sees front matter there (the YAML is a hidden Langium token, no title) and renders the chart; v13's preprocess reads the indented fence (#7613) and reports `UNCLOSED_FRONT_MATTER`, so v13 rejects it. It is a gate exclusion in `packages/conformance/src/radar/lexer-parity.spec.ts`, and the same divergence will show in #446's parity. It is shared core behaviour (every type), so the radar port does not change it; the D218 front-matter title is covered by a dedented copy.
- Accepted: `commented()` copies of one- and two-line sources often cut inside the header and never reach v12, so those copies are not gated (pie's helper, same limit); `LINE_SEPARATORS` are nine hand-written cases, as pie's.
- Shared edits: `harvest:pie` became `harvest:langium <pie|radar>|--all` (pie's corpus byte-identical; drift spec added); jison `runSpec` exported with `functionNames`.
- [ ] **#448:** drop radar's "reads at least one variable" skip in `tools/gen-config/src/theme-used-by.spec.ts`.

## T3 (#447)

- [ ] **Invariants on parser-produced fixtures.** #446 had not landed; the invariants run on hand-built `RadarModel` fixtures (`layout/fixtures.ts`). #446's merge adds the corpus spec through `@mermaid-js/diagram-radar/testing`'s `radarLayoutViolations`.
- Review fixes (orchestrator): Infinity entries never give NaN; >4-param helpers take a `Frame`; names. Accepted deviations: no title element when there is no title (no empty element); multi-line legend labels push later rows down (as pie's final review); out-of-range config values fall back to v12's default silently until #449.
- **`RadarModel` unchanged** by T3.
- **Stand-ins** in `packages/diagram-radar/src/stand-ins.ts` (theme variables and `radar` config defaults); #448 replaces the theme half with the radar `DiagramThemeTable`, #449 the config half.

## Theme T0a merged (2026-11-06)

- `origin/feature/414_theme-t0` at `462aef4e9` merged into `feature/422_radar` (API: `v13/docs/agents/runs/414/CONTRACT.md`). **Orchestrator choice:** the radar `DiagramThemeTable` (ten `radar*` vars, `section: 'radar'` with `nested` keys, `radarAxisColor` the rule `lineColor`) lands in #448 (T4) with the plugin object, declared inline on the plugin until T0b's per-package file convention lands; #448 deletes the theme half of `stand-ins.ts`. #449 (T5) keeps the theme oracle specs, the D333(b) differences and the nested-override fixture.

## Base sync (2026-11-06)

- `mermaid-v13` gained gantt #398 and gitGraph #404. Merging it here conflicts in 11 core theme files between T0a and M4 wave 2 (`theme/spec.ts`, `theme.ts`, `vocabulary.ts`, `specs/*`, `generated/variables.ts`): the T0's to resolve. Aborted; coordinator rule (until #472 merges): M5a ports take `mermaid-v13` only through `feature/414_theme-t0`, never directly; the T0 session merges all three wave-2 types (mindmap #406 too) and the coordinator sends the sha. Radar-owned conflicts expected then: `conformance/package.json`, `jison/harvest.ts` (gitGraph's harvest vs #445's `harvest:langium`), `langium-lexer.ts` row order, `theme-used-by.spec.ts`. Hosted CI does not run on #474 until the conflicts are gone.
