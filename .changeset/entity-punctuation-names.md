---
'@mermaid-js/core': patch
'@mermaid-js/diagram-quadrant': patch
'@mermaid-js/diagram-sequence': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/diagram-xychart': patch
---

fix: the punctuation entity names draw as their characters in labels: `#colon;`, `#semi;`, `#vert;`, `#lpar;`, `#lsqb;`, `#lcub;`, `#num;`, `#dollar;`, `#percnt;` and the rest of the 25 ASCII punctuation names, where `&colon;` was drawn. A `#name;` with a name Mermaid does not know is drawn as written (`#bogus;`), where v12 drew `&bogus;`, also in usecase labels and in quadrant text written without quotes. `@mermaid-js/core/text` exports `decodeEntities(text)` for text that is drawn without `layoutLabel`.
