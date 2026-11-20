---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/diagram-flowchart': patch
---

refactor: flowchart and agentflow share their `@{ shape }` names, id checks and node paint, and agentflow's source view uses the parser kit's `cut` and `markDroppedSemicolons`; output is unchanged.
