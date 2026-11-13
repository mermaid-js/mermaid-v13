---
'@mermaid-js/core': patch
---

fix: an unlabelled edge between a subgraph and one of its own nodes or nested subgraphs (`Sub --> In`, `In --> Sub`, `Outer --> Inner`, any depth) is drawn as a visible arrow from the subgraph's border instead of a few px between the two middles, and a subgraph linked to several of its own nodes gets an arrow into each.
