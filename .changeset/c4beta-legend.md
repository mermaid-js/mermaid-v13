---
'@mermaid-js/diagram-c4': patch
---

feat: c4-beta draws a legend below the diagram. It has a heading and one row per kind of element the diagram draws as a shape, named as the element's type line names it (`Software System`, and `External Software System` for an element tagged `external`) in the order each first appears; a frame (a group, a deployment node, an element with a body) has no row. Then come the `style` tags that an element or relation carries, named as written, with the style's `fill` and `stroke` on the swatch. It is on unless the source says `legend off`, so every c4-beta diagram with an element grows by the legend's height; `legend off` draws it as before. Legacy C4 is unchanged.
