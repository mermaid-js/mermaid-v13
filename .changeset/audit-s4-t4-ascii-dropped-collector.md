---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-er': patch
'@mermaid-js/diagram-requirement': patch
'@mermaid-js/diagram-usecase': patch
---

refactor: ER, requirement and usecase text output collect their `ASCII_DROPPED` warnings with the new shared `droppedFeatures` helper; the warnings are unchanged.
