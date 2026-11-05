# Run notes, spec #291 (timeline)

Integration branch `feature/291_timeline` (from `mermaid-v13` + `docs/m4-specs`, PR #284; + #285 as PR #346). Draft PR: #350.

| Ticket | Issue | Blocked by | State |
| --- | --- | --- | --- |
| T1 lexer parity gate | #308 | #285 (merged in e5f920116) | merged (ff 63cb58b7e) |
| T2 grammar, parser, model, AST | #336 | #308 | merged (ff f32238274) |
| T3 layout (LR and TD) | #337 | #336 (hand-built fixtures meanwhile) | merged (ff 70ad3a5d2) |
| T4a classic `cScale*`, `cScaleInv*`, `cScaleLabel*` palettes | #338 | — | merged |
| T4 SVG renderer | #311 | #337, #338 | merged (ff 7dfbff7c8) |
| T5 integration | #315 | #311, #318 | in progress |
| T6 language facet | #318 | #336 | merged (ff 9dd59f928) |

- `01-v12-timeline.md`: pointer notes on v12 grammar, DB, renderers, styles, themes, corpus.
- `IMPLEMENTER.md`: the brief every ticket agent reads.
- `GAPS.md`: unmet criteria and choices per ticket.
- `tickets/<n>.md`: handoffs.

## Finish rule

The integration PR stays a draft until every ticket is merged, the final whole-branch `/code-review` is fixed, and `pnpm check`, `pnpm e2e` (Playwright image) and the local bench are green. Then `gh pr ready`; never merge into `mermaid-v13`. The PR body lists the `gh issue close` commands.
