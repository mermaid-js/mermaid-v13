---
'mermaid': patch
'@mermaid-js/core': patch
---

feat: core's `swimlane` layout engine, `@mermaid-js/core/layout/swimlane` (loaded lazily, outside the core budget), ported from v12's swimlane engine without pools and anchored nodes. Top-level groups are lanes along the diagram's direction, with nodes outside every group in a default lane; each lane reserves its title band, on top for `TB`/`BT` and on the left for `LR`/`RL`. Any graph diagram can select it with `layout: swimlane`. Edges get simple right-angled routes for now; the orthogonal router follows.
