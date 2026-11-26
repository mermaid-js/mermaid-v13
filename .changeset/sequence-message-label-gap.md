---
'@mermaid-js/diagram-sequence': patch
---

fix: sequence message text sits just above its arrow, as in v12, instead of about 11 px too high, never over its `autonumber` circle and never under the arrow itself (a large `wrapPadding`, a small font or a `rightAngles` self message); lines and diagram height do not change.
