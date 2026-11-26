---
'@mermaid-js/plugin-html-labels': patch
'@mermaid-js/diagram-flowchart': patch
'@mermaid-js/core': patch
'mermaid': patch
---

feat: v12's label classes on HTML labels, and a pointer to the plugin. With `@mermaid-js/plugin-html-labels` registered, a flowchart label's wrapper carries v12's `nodeLabel` or `edgeLabel` class. Without the plugin, the warning for a v12 `htmlLabels` key now names the package to register. For plugin authors: a whole-label provider gets `request.role` (`node`, `edge` or `group`, when the diagram says); `@mermaid-js/core/svg/testing` has `hostileLabelSources()`; and `v13/docs/extension-plugins.md` is a guide to writing an extension.
