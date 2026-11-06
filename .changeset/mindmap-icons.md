---
'@mermaid-js/diagram-mindmap': patch
---

feat: mindmap `::icon()` draws its glyph with the icons plugin (`@mermaid-js/plugin-icons`) from the registered packs, 40 px in the icon slot, in the label's section colour (`fa fa-book` → `fa:book`, `mdi mdi-fire` → `mdi:fire`). An icon that does not resolve, or any icon without the plugin, is still shown as written with `ICON_NOT_RENDERED`.
