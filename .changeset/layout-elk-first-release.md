---
'@mermaid-js/layout-elk': patch
'mermaid': patch
---

feat: first release of `@mermaid-js/layout-elk` on the 13.x line, the ELK layouts (`elk`, `elk.layered`, `elk.stress`, `elk.force`, `elk.mrtree`, `elk.sporeOverlap`, `elk.box`, `elk.rectpacking`, `elk.radial`), laid out synchronously with elkjs. Register it as in v12 with `mermaid.registerLayoutLoaders(elkLayouts)`; installing it changes no default. Without it, `mermaid` draws an ELK name or the `flowchart-elk` header with `layered` and adds one `ELK_NOT_INSTALLED` warning.
