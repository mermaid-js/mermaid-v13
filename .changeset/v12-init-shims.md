---
'mermaid': patch
---

fix: pages written for v12 that call `mermaid.init()`, `mermaid.getRegisteredDiagramsMetadata()` or set `mermaid.startOnLoad = false` keep working. All three are back, deprecated: `init(config, nodes, callback)` calls `initialize()` and `run()`, `getRegisteredDiagramsMetadata()` lists the detectors' ids in v12's order, and `startOnLoad = false` stops the page-load render.
