---
'@mermaid-js/core': patch
---

A zero-width space (U+200B) in a label is kept in the drawn text, as in v12, and is still a place where the label can wrap. A YAML anchor on a key that holds a nested mapping now gets the "tags, anchors and aliases are not supported" error instead of "bad indentation of a mapping entry".
