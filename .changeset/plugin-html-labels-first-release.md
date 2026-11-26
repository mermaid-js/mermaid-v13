---
'@mermaid-js/plugin-html-labels': patch
'@mermaid-js/core': patch
'mermaid': patch
---

feat: first release of `@mermaid-js/plugin-html-labels`, HTML labels as v12 drew them with `htmlLabels: true`. Register `htmlLabels` with `registerExternalDiagrams([htmlLabels])`: labels are then measured as HTML in the browser and mounted in a `<foreignObject>`, sanitised by DOMPurify. `htmlLabels: false` turns it off; the plugin's key is `html.labels`. The svg string `render()` returns still holds no HTML: `run()`, `mount()` or `result.bindFunctions(el)` swap the labels in, and `mountHtmlLabels(el)` does it for a stored string. In Node, in a deterministic render and in text output labels stay SVG text. For plugin authors, an extension can now lay out a whole label with `label.box(raw, request, ctx)`, and `RenderContext.deterministic` says when the integrator asked for a deterministic render.
