---
'@mermaid-js/diagram-ishikawa': patch
---

fix: an ishikawa effect, cause or sub-cause written as a quoted markdown string (`` "`**bold**`" ``) renders as markdown, in SVG and text output, instead of showing its quotes and backticks.
