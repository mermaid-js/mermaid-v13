---
'@mermaid-js/diagram-block': patch
---

fix: a block arrow pointing four ways (`(x, y)`) reserves room for its arrowheads, so the grid's padding stays between it and its neighbours, as in v12.
