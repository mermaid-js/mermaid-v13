---
'@mermaid-js/core': patch
'mermaid': patch
'@mermaid-js/diagram-flowchart': patch
---

refactor: large functions in the layered layout engine, the SVG allow-list check, the label and source readers, the flowchart parser and renderer and `createMermaid` are split into smaller ones. Rendered SVG and text output are unchanged; the core bundle grows by about 1.6 KB gzip.
