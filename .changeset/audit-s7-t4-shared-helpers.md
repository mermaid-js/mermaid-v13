---
'@mermaid-js/core': patch
'@mermaid-js/shared': patch
'mermaid': patch
'@mermaid-js/language-service': patch
'@mermaid-js/diagram-venn': patch
'@mermaid-js/diagram-block': patch
'@mermaid-js/layout-elk': patch
---

refactor: shared helpers replace copies, with rendered output unchanged and no code added to what a page loads first. `@mermaid-js/shared/random` holds the seeded generator venn lays out with; `@mermaid-js/core/layout/box-exit` holds the ray-box exit that block and ELK clip edges with; `@mermaid-js/core/parser-kit/embed-type` builds the `EMBED_NO_TYPE` error that the renderer and the language service both report. In `mermaid`, `RenderOptions.format` and `PreloadRequest.formats` are typed with core's `PluginFormat` (still `'svg' | 'ascii'`), and `LayoutLoader.loader` is a function property.
