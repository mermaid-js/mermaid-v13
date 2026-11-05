---
'@mermaid-js/layout-elk': patch
'@mermaid-js/core': patch
'mermaid': patch
---

feat: `@mermaid-js/layout-elk` honours every v12 `elk.*` key (`mergeEdges`, `nodePlacementStrategy`, `nodePlacementAlignment`, `preset`, `straightenEdges`, `lineHops`, `layeringStrategy`, `layeringLayerBound`, `cycleBreakingStrategy`, `forceNodeModelOrder`, `considerModelOrder`, `keepEntryNodeOnTop`, `orientFeedbackEdges`) with v12's defaults and presets. The `elk` section moves out of core's config schema into the package's config fragment: core knows it only while the package is registered. A group's `@{ algorithm }` is parsed but not applied yet and gives one `ELK_ALGORITHM_IGNORED` warning; `elk.radial` on a graph ELK cannot lay out as a tree draws with `layered` and one `ELK_RADIAL_NOT_A_TREE` warning. `LayoutLoader` gains an optional `extension`, registered with the loaders.
