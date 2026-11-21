---
'@mermaid-js/diagram-c4': minor
---

feat: a C4 diagram (`C4Context` and the other four) takes `direction TB`, `BT`, `LR` or `RL` instead of failing. It sets the order the grid fills: TB (the default, drawn as before) fills rows from left to right and goes down, LR fills columns from top to bottom and goes right, and BT and RL are those with the lines in the opposite order. A `direction` inside a boundary's braces sets that boundary's order; a boundary with none takes its parent's, and the last statement wins. A label that holds the words (`Person(a, "the direction LR is")`) stays a label.
