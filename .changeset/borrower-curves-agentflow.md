---
'@mermaid-js/diagram-agentflow': patch
---

feat: agentflow edges follow `linkStyle … interpolate`, then `agentflow.curve`, then the top-level `curve`, then `rounded`; `flowchart.curve` no longer changes an agentflow diagram, so set `agentflow.curve` instead.
