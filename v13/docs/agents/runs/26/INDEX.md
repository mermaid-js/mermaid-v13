# Run 26: M2.5 language service (pointers only)

Spec #26. Breakdown and blocking edges: v13/docs/DESIGN.md §4.5 "M2.5 work breakdown". Decisions D88–D99 (DECISIONS.md "M2.5"). Requirements R-LANG-1…8.

| Area | Where |
| --- | --- |
| Parser kit | packages/core/src/parser-kit/ (cursor.ts = TokenCursor, result.ts = ParseResult, positions.ts = LineIndex, tiny-grammar.spec.ts = kit example grammar) |
| Flowchart parser | packages/diagram-flowchart/src/parser/ (parser.ts parseFlowchart, lexer.ts, tokens.ts, tokens-api.ts) |
| Flowchart grammar + generated highlighters | packages/diagram-flowchart/grammar/flowchart.ebnf, grammar/generated/{flowchart.grammar (Lezer), .monarch.json, .tmLanguage.json, .tokens.js} |
| gen-grammar | tools/gen-grammar/src/ (generate.ts, highlight.ts + highlight.spec.ts, syntax-doc.ts), `pnpm gen:grammar` / `pnpm check:grammar` |
| YAML subset reader | packages/core/src/preprocess/yaml.ts (`parseYaml`, MAX_YAML_DEPTH), used by frontmatter.ts:126 |
| Config JSON schema | tools/gen-config (`pnpm gen:config`) |
| Oracle symbol/fold expectations | packages/conformance |
| Full gate | `pnpm check` (root package.json) |

## Open PRs that collide
- #115 and #119 (FlowParser class refactor) rewrite flowchart `parser.ts`/`model.ts` and add parser-kit `view.ts`. #27 (probe) and #29 (facet) start only after they merge into mermaid-v13 and the integration branch picks them up.
- #119 also exports `isYamlMap` from core preprocess (small; #30 merges around it).
