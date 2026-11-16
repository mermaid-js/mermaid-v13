---
'@mermaid-js/diagram-er': patch
---

fix: ER labels format Markdown emphasis as v12 does: `**bold**`, `__bold__`, `*italic*` and `_italic_` in entity names, aliases, attributes, relationship labels and subgraph titles are drawn bold and italic, and text output drops the markers. An underscore inside a word (`order_item`) is unchanged. A `#name;` with a name Mermaid does not know is drawn as written (`#bogus;`) in ER labels too.
