---
'@mermaid-js/diagram-state': patch
'@mermaid-js/layout-elk': patch
---

fix: a state diagram with a transition between a composite state and its own child, written inside the composite (`state Boot { Running; Boot --> Running }`), no longer blocks the process under the ELK layouts. The composite stays where it was declared and the transition is drawn. The ELK engine now refuses a group that sits inside itself with an error instead of looping.
