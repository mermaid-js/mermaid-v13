---
'@mermaid-js/diagram-eventmodeling': patch
---

fix: a relation between two boxes of one lane that skips a box now runs under the row instead of through the box, so the skipped box's name stays readable, and a frame that names itself as its source gets a loop under its box's bottom right corner that reads as a loop. A lane that holds such a route grows to fit it; box tops stay where they were.
