# Run notes, spec #126 (class diagram)

Integration: `feature/126_class-diagram`, draft PR #166 into `mermaid-v13`. All tickets merged (#158 at `50cb3b44e`); final review fixes on `fix/126_final-review`.

| Ticket | Title | Blocked by | Branch |
| --- | --- | --- | --- |
| #152 | T0 edge-end labels (core) | – | feature/152_edge-end-labels, merged here; draft PR #165 into mermaid-v13 |
| #153 | T1 lexer gate | – | feature/153_class-lexer, merged here |
| #154 | T2 grammar, parser, model, AST | #153, #27, #28 | feature/154_class-parser, merged here |
| #155 | T3 layout | #152, #154 | feature/155_class-layout, merged here |
| #156 | T4 renderer | #155 | feature/156_class-render, merged here |
| #157 | T5 integration | #156 | feature/157_class-integration, merged here |
| #158 | interactions (D105) | #156; not alongside #125's | feature/158_class-interactions, merged here (after sequence #147, D112) |
| #159 | T6 language facet | #154, #29, #31 | feature/159_class-language, merged here |
| #201 | multiplicities clear of markers across edges | – | fix/201_class-marker-clearance, merged here; core half via #203 |
| #185 | T0b core `sourceView` directive fix (D114) | – | fix/185_source-view-directives, merged via #186 |

Notes:
- [01-v12-class.md](01-v12-class.md): v12 class grammar, DB, renderers, specs, fixture counts (pointers).

## Finish (maintainer rule, 2026-11-04)

#166 stays a draft until all of these hold; then `gh pr ready 166 -R mermaid-js/mermaid-v13` (never merge it):
1. Every class ticket (#153–#159) is merged into `feature/126_class-diagram`.
2. The final whole-branch `/code-review` has run and its findings are fixed.
3. `pnpm check`, the full e2e suite and the bench run pass locally, under the locks.
4. GAPS.md has nothing unmet except items the maintainer accepted.
5. The PR description carries these results and the bench load-path size (D110).
The same report lists the `gh issue close` commands for the tickets.
