# Run notes, spec #126 (class diagram)

Integration: `feature/126_class-diagram`, draft PR #166 into `mermaid-v13`. Paused 2026-11-04: #154 onwards wait for #27 and #28.

| Ticket | Title | Blocked by | Branch |
| --- | --- | --- | --- |
| #152 | T0 edge-end labels (core) | – | feature/152_edge-end-labels, merged here; draft PR #165 into mermaid-v13 |
| #153 | T1 lexer gate | – | feature/153_class-lexer, merged here |
| #154 | T2 grammar, parser, model, AST | #153, #27, #28 | |
| #155 | T3 layout | #152, #154 | |
| #156 | T4 renderer | #155 | |
| #157 | T5 integration | #156 | |
| #158 | interactions (D105) | #156; not alongside #125's | |
| #159 | T6 language facet | #154, #29, #31 | |

Notes:
- [01-v12-class.md](01-v12-class.md): v12 class grammar, DB, renderers, specs, fixture counts (pointers).
