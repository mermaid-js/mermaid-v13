---
'@mermaid-js/diagram-agentflow': patch
'@mermaid-js/shared': patch
---

Agentflow reads its config lengths through the shared reader, with the same warnings; the shared reader reads only a config section's own keys.
