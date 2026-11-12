---
'@mermaid-js/diagram-journey': patch
'@mermaid-js/diagram-timeline': patch
---

fix: journey task and section names and timeline labels keep a word wider than their box whole, as v12 did, instead of splitting it between characters (#649). The box widens by what the word needs, so the label stays inside it: a journey task (and the tasks after it move along), a timeline LR column (and the columns after it), a timeline TD period to the left or event and section to the right. Diagrams without such a word lay out as before. Journey legend names still wrap and split at `maxLabelWidth`.
