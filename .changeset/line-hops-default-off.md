---
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
---

fix: line hops are off by default again (`lineHops: false`), because drawing them slowed every render down; set `lineHops: true` to turn them on. Swimlane and ELK layouts still hop by default.
