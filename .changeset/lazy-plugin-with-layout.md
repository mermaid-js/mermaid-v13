---
'mermaid': patch
---

fix: a third-party diagram plugin that has a `layout` method now loads through a `loader` and through package discovery. Before, the render failed with `plugin.parse is not a function`.
