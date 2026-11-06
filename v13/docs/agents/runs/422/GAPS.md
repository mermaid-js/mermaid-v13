# Gaps (spec #422)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Radar adds no core contract (the theme table and the `radar` section come from #414 T0a); no ASCII ticket (D320).
- **Theme stand-ins until T0a.** T3/T4 read the ten `radar*` variables through one stand-in module with v12's defaults; T5 deletes it when the package theme table lands. No radar row goes into core's vocabulary (R-PERF-8), so the spec's pure-call-rows fallback is not used unless T0a slips past T4.

## Shared contracts

- **`RadarModel`** (`packages/diagram-radar/src/model.ts`): landed by the orchestrator before #446 and #447 started in parallel, shaped from the spec's model list. #446 produces it; #447 reads it. Change it only additively and note the change here.
- **Package skeleton** (`packages/diagram-radar`, private, no manifest until #449): landed with the model. #445 adds the lexer to it.

## T3 (#447)

- [ ] **Invariants on parser-produced fixtures.** #446 had not landed; the invariants run on hand-built `RadarModel` fixtures (`layout/fixtures.ts`). #446's merge adds the corpus spec through `@mermaid-js/diagram-radar/testing`'s `radarLayoutViolations`.
- **`RadarModel` unchanged** by T3.
- **Stand-ins** in `packages/diagram-radar/src/stand-ins.ts` (theme variables and `radar` config defaults); #448 replaces the theme half with the radar `DiagramThemeTable`, #449 the config half.

## Theme T0a merged (2026-11-06)

- `origin/feature/414_theme-t0` at `462aef4e9` merged into `feature/422_radar` (API: `v13/docs/agents/runs/414/CONTRACT.md`). **Orchestrator choice:** the radar `DiagramThemeTable` (ten `radar*` vars, `section: 'radar'` with `nested` keys, `radarAxisColor` the rule `lineColor`) lands in #448 (T4) with the plugin object, declared inline on the plugin until T0b's per-package file convention lands; #448 deletes the theme half of `stand-ins.ts`. #449 (T5) keeps the theme oracle specs, the D333(b) differences and the nested-override fixture.
