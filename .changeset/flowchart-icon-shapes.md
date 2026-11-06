---
'@mermaid-js/diagram-flowchart': patch
---

feat: flowchart icon shapes (`@{ icon: … }`, with `form: square`, `circle` or `rounded`) draw their glyph with `@mermaid-js/plugin-icons`, as v12 did: the glyph takes the node's `stroke` style, else `nodeBorder`, or the gradient under `useGradient` (`neo`, `neo-dark`), and the frame is borderless. An icon that is not drawn keeps its outlined frame, with one `ICON_NOT_RENDERED` per render (also without the icons extension). `ICON_UNAVAILABLE` is deprecated: for one alpha it is raised once per render next to `ICON_NOT_RENDERED` (which names the icons with the icons extension), with a fixed message as `SEQUENCE_MATH`, and no longer for a placeholder render.
