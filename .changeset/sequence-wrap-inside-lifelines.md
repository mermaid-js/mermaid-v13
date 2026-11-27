---
'@mermaid-js/diagram-sequence': patch
---

fix: a wrapped message between two neighbouring participants now wraps inside their lifelines instead of running over them, with every `messageAlign`; a word too wide for that room stays whole rather than breaking into single letters.
