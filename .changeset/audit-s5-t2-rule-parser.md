---
'@mermaid-js/diagram-eventmodeling': patch
'@mermaid-js/diagram-treemap': patch
'@mermaid-js/shared': patch
---

refactor: the event modeling and treemap parsers now use the shared rule parser code instead of their own copies, and the shared `RuleGrammar` takes two optional hooks, `view` and `tokens`. Diagrams, diagnostics, errors, completions and hover are unchanged.
