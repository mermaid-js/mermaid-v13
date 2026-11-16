---
'@mermaid-js/language-server': patch
'mermaid': patch
---

The language server now finds plugins exactly as `mermaid` does in Node, so a plugin package needs its `entry` file to get editor support, and a client with no workspace folder gets no plugins; `mermaid/node-scan` adds `packageModule` (#808).
