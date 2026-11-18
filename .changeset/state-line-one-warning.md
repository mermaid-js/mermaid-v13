---
'@mermaid-js/diagram-state': patch
---

fix: a state diagram line such as `state State1: Description 1` now gives one warning that suggests `State1 : Description 1`, instead of one warning per word.
