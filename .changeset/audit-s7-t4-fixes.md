---
'@mermaid-js/plugin-interactions': patch
'@mermaid-js/language-service-codemirror': patch
---

fix: click callbacks and menus bind on a page holding several diagrams even when an element id contains a tab or a line break, and the CodeMirror highlighter recognises a diagram whose first line ends in a `%%` comment, as the language service already did.
