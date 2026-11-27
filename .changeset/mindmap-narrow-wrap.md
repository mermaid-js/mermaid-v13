---
'@mermaid-js/diagram-mindmap': patch
---

fix: with `mindmap.maxNodeWidth` unset, square, rounded and hexagon mindmap labels wrap at 120 px, as in v12, instead of 200; a `maxNodeWidth` you set still wraps every shape.
