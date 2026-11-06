# Run notes, spec #421 (packet)

Integration branch `feature/421_packet`, cut from `mermaid-v13` at `dd4b9d19f` (D314–D428 merged, #411).

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate on the shared Langium oracle | #452 | — | merged |
| T2 grammar, parser, model, AST, ported specs | #454 | #452 | merged |
| T3 custom layout (`PacketLayout`) | #456 | #454 (soft) | merged (review fixes merged) |
| T4 SVG renderer and theme table | #460 | #454, #456 | merged |
| T5 integration | #462 | #460, #414 T0a/T0b | merged |
| T6 language facet | #458 | #454 | merged |
| T7 ASCII renderer (optional, D347) | #464 | #462 | running |

- `01-v12-packet.md`: pointer notes on v12 grammar, DB, renderer, specs, corpus and the v13 seams.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and orchestrator choices, per ticket.
- `tickets/<n>.md`: handoffs.

## Theme: #414's T0a is merged

`feature/414_theme-t0` (`462aef4e9`) is merged into this branch; its API is `v13/docs/agents/runs/414/CONTRACT.md`. Packet's ten variables go in the package's `DiagramPlugin.theme` table with section `packet` (D322, D331, D335, D540), declared inline on the plugin until T0b's per-package file convention lands. T4 builds the table; T5 adds the oracle spec and baselines. Use `createTheme(spec, { diagram: table })` in unit tests; the direction check is `tools/gen-config/src/theme-direction.spec.ts`.

Merge order upstream: M4 wave 2 (#398, #404, #406), then the Theme T0 (#414), then the M5a ports. Merge `mermaid-v13` here as each lands, keeping both sides; regenerate generated files rather than hand-merging them (D112).

## Finish rule

The integration PR stays a draft until all of these hold; then `gh pr ready <PR> -R mermaid-js/mermaid-v13` (never merge it):
1. Every ticket above (T7 optional) is merged into `feature/421_packet`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check` and `pnpm e2e` pass locally, under the locks, and hosted CI is green.
4. GAPS.md has nothing unmet, apart from items recorded "For the maintainer".
5. The PR description carries these results, the gz size and the issues to close.
