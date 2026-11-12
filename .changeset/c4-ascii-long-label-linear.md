---
'@mermaid-js/diagram-c4': patch
---

fix: C4 text output (`format: 'ascii'`) no longer slows sharply with the length of a relation's label. Placing a label took time that grew with the square of its length (about 23 s for a 16,000-character label); it now grows with the length. The drawing is unchanged.
