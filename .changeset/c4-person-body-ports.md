---
'@mermaid-js/diagram-c4': patch
---

fix: in C4 diagrams, relations beside a person now end on the person's body instead of its head: a row holding a person lines up with the body. Two shapes in a row joined by labelled relations now stand far enough apart for each label to sit on its own line, and the labels of lines too close for one label each are staggered along them. Text output and c4-beta are unchanged.
