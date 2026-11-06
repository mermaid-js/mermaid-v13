# Gaps (spec #422)

Unmet acceptance criteria and orchestrator choices, filed under the ticket that owns each one. Choices not covered by the spec or a D-id are also listed under "For the maintainer" in the PR body.

## Orchestrator choices

- **No T0, no T7.** Radar adds no core contract (the theme table and the `radar` section come from #414 T0a); no ASCII ticket (D320).
- **Theme stand-ins until T0a.** T3/T4 read the ten `radar*` variables through one stand-in module with v12's defaults; T5 deletes it when the package theme table lands. No radar row goes into core's vocabulary (R-PERF-8), so the spec's pure-call-rows fallback is not used unless T0a slips past T4.

## Shared contracts

- **`RadarModel`** (`packages/diagram-radar/src/model.ts`): landed by the orchestrator before #446 and #447 started in parallel, shaped from the spec's model list. #446 produces it; #447 reads it. Change it only additively and note the change here.
- **Package skeleton** (`packages/diagram-radar`, private, no manifest until #449): landed with the model. #445 adds the lexer to it.
