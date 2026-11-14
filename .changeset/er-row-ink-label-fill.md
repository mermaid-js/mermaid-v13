---
'@mermaid-js/diagram-er': patch
---

fix: ER attribute text takes the ink against its own row's fill (`erRowOddTextColor`, `erRowEvenTextColor`), so it reads when a dark `primaryColor` lightens the rows, and the classic themes fill the relationship label with `tertiaryColor` at half opacity, as v12 does.
