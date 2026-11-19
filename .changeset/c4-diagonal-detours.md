---
'@mermaid-js/diagram-c4': patch
---

A C4 relation between two shapes that are apart both across and down, with shapes in its way that no elbow of two bends clears, is now routed round them through the gaps between the shapes, instead of drawn straight through them. It is drawn straight only once the layout's work budget (`maxLayoutWork`) is spent.
