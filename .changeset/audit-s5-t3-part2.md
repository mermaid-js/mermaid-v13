---
'@mermaid-js/shared': patch
'@mermaid-js/diagram-gitgraph': patch
'@mermaid-js/diagram-treemap': patch
---

refactor: the shared rule and state lexers scan blanks, spaces and line ends with core's scanners, gitGraph reports an unclosed string through the shared `unclosedLabel`, and treemap names the token it found with the shared `foundText`. Output, diagnostics and error messages are unchanged.
