---
'@mermaid-js/plugin-html-labels': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/core': patch
'mermaid': patch
---

feat: math and icons inside HTML labels, and v12's label classes. With `@mermaid-js/plugin-html-labels` registered, a label with `$$…$$` or `fa:fa-…` is now an HTML label too, with the math or icon drawn by `@mermaid-js/plugin-math` and `@mermaid-js/plugin-icons` in the room the HTML leaves for it. In a flowchart the label's wrapper carries v12's `nodeLabel` or `edgeLabel` class. Without the plugin, the warning for a v12 `htmlLabels` key now names the package to register. For plugin authors: a whole-label provider gets `request.role` (`node`, `edge` or `group`, when the diagram says) and `request.inline(text)`, which boxes a label's math and icons with the registered inline providers; `@mermaid-js/core/svg/testing` has `hostileLabelSources()`; and `v13/docs/extension-plugins.md` is a guide to writing an extension.
