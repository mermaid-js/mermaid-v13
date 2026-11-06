# Run notes, spec #423 (cynefin)

Integration branch `feature/423_cynefin`, checked out at `/Users/knsv/repos/mermaid-v13/.claude/worktrees/423-cynefin-6600fe`.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #461 | — | open |
| T2 grammar, parser, model, AST, ported specs | #465 | #461 | open |
| T3 custom layout (`CynefinLayout`), seeded boundaries | #467 | #465 (soft) | open |
| T4 SVG renderer | #468 | #465, #467 | open |
| T5 integration (manifest, config, theme table, baselines) | #469 | #468, #414 T0a | open |
| T6 language facet | #470 | #465 | open |

- `01-v12-cynefin.md`: pointer notes on v12 grammar, DB, renderer, boundaries, specs, corpus and the v13 seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and orchestrator choices, per ticket.
- `tickets/<n>.md`: handoffs.

## Shared contracts

- **`CynefinModel`** (`packages/diagram-cynefin/src/model.ts`): landed by the orchestrator with the package skeleton before T1 and T3 started. T2 produces it; T3 reads it. Change it only additively and note the change in GAPS.md.
- **Theme table** (#414 T0a, `feature/414_theme-t0` at `462aef4e9`, merged here in `b926c9994`): `DiagramThemeTable` on `DiagramPlugin.theme`. API: `v13/docs/agents/runs/414/CONTRACT.md`. T4 declares cynefin's table inline on the plugin (T0b's per-package `src/theme/vocabulary.ts` convention is still in progress and will be additive); T5 adds the theme oracle specs, nested-override fixtures and baselines. Never add cynefin rows to core.

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above is merged into `feature/423_cynefin`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check` and `pnpm e2e` pass locally, under the locks; hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gz size and the issues to close.
