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

- [x] **Invariants on parser-produced fixtures.** Closed by #446: `packages/conformance/src/radar/layout-corpus.spec.ts` runs `radarLayoutViolations` (from `./testing`) over the gate corpus parsed by `parseRadar`, both graticules × 4 configs, 0 violations.
- Review fixes (orchestrator): Infinity entries never give NaN; >4-param helpers take a `Frame`; names. Accepted deviations: no title element when there is no title (no empty element); multi-line legend labels push later rows down (as pie's final review); out-of-range config values fall back to v12's default silently until #449.
- **`RadarModel` unchanged** by T3.
- **Stand-ins** in `packages/diagram-radar/src/stand-ins.ts` (theme variables and `radar` config defaults); #448 replaces the theme half with the radar `DiagramThemeTable`, #449 the config half.

## T2 (#446)

- **`RadarModel` unchanged** by T2. Additive export: `layoutRadar` and the `RadarLayout` types from the runtime entry (for the layout corpus spec, as pie's #305).
- Parity over the gate corpus: 0 divergences; exclusions as T1's (unclosed directives, the indented-front-matter dev diagram), each asserted to differ only in core. Nothing added to `divergences.json`.
- Choices: a curve with a semantic error (`Missing entry …`, `Axes must be populated …`) stays in the model with the entries it has; `UNCLOSED_ACC_DESCR` is reported for a name `accDescr` followed by `{` (radar's lexer yields no error token there); one `RADAR_UNKNOWN_AXIS` per parse with the others `related` (D356).
- Skipped ported specs: `closedRoundCurve` path strings and `draw` (#448 ports them, edit `SKIP` in `scripts/port-v12-specs.ts`); v12's "unknown location at the end of input" (v13 locates it).

## Theme T0a merged (2026-11-06)

- `origin/feature/414_theme-t0` at `462aef4e9` merged into `feature/422_radar` (API: `v13/docs/agents/runs/414/CONTRACT.md`). **Orchestrator choice:** the radar `DiagramThemeTable` (ten `radar*` vars, `section: 'radar'` with `nested` keys, `radarAxisColor` the rule `lineColor`) lands in #448 (T4) with the plugin object, declared inline on the plugin until T0b's per-package file convention lands; #448 deletes the theme half of `stand-ins.ts`. #449 (T5) keeps the theme oracle specs, the D333(b) differences and the nested-override fixture.
