---
'@mermaid-js/core': patch
'@mermaid-js/diagram-agentflow': patch
---

Removed `@mermaid-js/core/svg/document` and `@mermaid-js/core/config/readers`; import them from `@mermaid-js/shared/svg/document` and `@mermaid-js/shared/config/readers` instead. Agentflow reads its config lengths through the shared reader, with the same warnings.
