---
'@mermaid-js/diagram-state': patch
---

fix: a state with several descriptions is titled by its first description, with the others below the divider, as in v12; the state id is no longer drawn as the title, and an aliased state (`state "Name" as S1`) with a description shows its name (#762).
