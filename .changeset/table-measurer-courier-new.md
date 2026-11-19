---
'@mermaid-js/core': patch
---

fix: the table measurer (Node, the CLI and `deterministic: true`) measures monospace fonts as Courier New instead of Arial, so boxes fit text drawn in `courier`, `"Courier New"`, `monospace`, `ui-monospace`, Menlo, Monaco, DejaVu Sans Mono, Liberation Mono, Andale Mono or PT Mono (#759).
