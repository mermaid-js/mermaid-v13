---
'@mermaid-js/core': patch
'@mermaid-js/diagram-usecase': patch
'@mermaid-js/diagram-state': patch
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/diagram-agentflow': patch
---

fix: label wrapping breaks after a hyphen between letters (`subcontainer-` / `sibling`) before it splits a word between characters, as v12's HTML labels did (#394). Use case, state, mindmap and agentflow labels keep a word wider than the wrap width whole on a line of its own, and the shape grows to hold it, as in v12 (#649); their text output still splits it to keep it in its box.
