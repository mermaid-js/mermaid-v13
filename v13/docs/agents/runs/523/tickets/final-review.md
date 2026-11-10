# Final whole-branch review fixes (PR #632): handoff

Branch `feature/523_agentflow-final-review` (from `feature/523_agentflow` at eaa18f19d). Details and what was left: GAPS "Final review".

## Spec
- S1: `CONTAINMENT_VIOLATION` at the nested opening that closes the loop (`parser/containment.ts` `FlowOpenings`); falls back to the first opening for a by-name member. Test: `parser/parse.spec.ts`.
- S2: D461's three codes and D464's four warnings carry `astIds` (type `AgentflowParseWarning`), every repeat; core's `toWarning` already copies them (no core change). Test: `mermaid/src/agentflow.spec.ts` through `render()`.

## Standards (review items)
- Done: 1 (`linearRatio`), 2 ("Changed:" headers), 3 (`maxTextSize` once + `render()` test), 4, 5 (`configLengths<K>`), 6 (`parseAgentflowForTest` in `./testing`), 7 (rule once in the section description; regen), 8, 9, 10, 12, 13.
- Partly: 11 (`layoutDir` the one reading, `DIRECTION_DOCS`; the model's `direction` stays a string: v12's `BR` and flow `TD` are parity data, D465); 14 (`REMOVED_SHAPES` stays exported: `language.spec.ts` reads it).
- Left: 15 (facet/semantic need parser internals that `parser/index.ts`, re-exported wholesale by the public entries, does not export).

## Test helper
`parseAgentflowForTest(source, { config?, idPrefix?, claims? })` → `{ preprocessed, parse, config, limits, theme, warnings }`; `renderAgentflowForTest` builds on it.

## Identity (pitfall 28)
SVG (default, dark), ASCII (both charsets), tokens, models, ASTs, semantic models over the gate corpus (4,573 sources): byte-identical; only differences are the new `astIds` (398 parses, 359 renders).

## Checks (Node 24.16, `env -u PARSE_FIXTURE_PATH`)
- Scoped (`VITEST_MAX_WORKERS=2`): `packages/diagram-agentflow`, `conformance/src/agentflow`, `parity.spec.ts`, `mermaid/src/agentflow.spec.ts`, bench `language-bundle`: 52 files, 630 passed. `tsc` agentflow, conformance, mermaid clean; eslint on changed files clean.
- Full `pnpm check` under the lock (`VITEST_MAX_WORKERS=4`; schema changed): exit 0, 1,115 files, 21,987 passed.
