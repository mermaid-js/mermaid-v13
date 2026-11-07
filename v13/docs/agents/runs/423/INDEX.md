# Run notes, spec #423 (cynefin)

Integration PR: #479 (draft). Integration branch `feature/423_cynefin`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/423-cynefin-6600fe`.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #461 | — | merged |
| T2 grammar, parser, model, AST, ported specs | #465 | #461 | merged |
| T3 custom layout (`CynefinLayout`), seeded boundaries | #467 | #465 (soft) | merged |
| T4 SVG renderer | #468 | #465, #467 | merged |
| T5 integration (manifest, config, theme table, baselines) | #469 | #468, #414 T0a | merged |
| T6 language facet | #470 | #465 | merged |

- `01-v12-cynefin.md`: pointer notes on v12 grammar, DB, renderer, boundaries, specs, corpus and the v13 seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and orchestrator choices, per ticket.
- `tickets/<n>.md`: handoffs.

## Shared contracts

- **`CynefinModel`** (`packages/diagram-cynefin/src/model.ts`): landed by the orchestrator with the package skeleton before T1 and T3 started. T2 produces it; T3 reads it. Change it only additively and note the change in GAPS.md.
- **Theme table** (#414 T0a, `feature/414_theme-t0` at `462aef4e9`, merged here in `b926c9994`; T0b at `f025e1841`, merged in `a1dfa857b`): `DiagramThemeTable` on `DiagramPlugin.theme`. API: `v13/docs/agents/runs/414/CONTRACT.md`. Cynefin's 15 variables are declared in `packages/diagram-cynefin/src/theme/vocabulary.ts` (T0b) and the table in `src/theme/table.ts` takes `vars: THEME_VARIABLE_TABLE` from `pnpm gen:theme`; T5 adds the theme oracle specs, nested-override fixtures and baselines. Never add cynefin rows to core.

## Base rule

#472 merged; take mermaid-v13 directly. (The Theme T0 tip `f025e1841`, which carried M4 wave 2 and `mermaid-v13` `c6ad88562`, was merged here in `a1dfa857b`; `mermaid-v13` at `7826e952e`, #472's merge, followed in `e735c4bd0`.)

- Pushing: the pre-push `pnpm check` timed out twice on `conformance/src/flowchart/probe.spec.ts` (80–95 s of 60 s) at load ~30 on 10 cores; it passes alone in 44 s. Push with `VITEST_MAX_WORKERS=4` (every test still runs).

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/423_cynefin`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check` and `pnpm e2e` pass locally, under the locks; hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gz size and the issues to close.
