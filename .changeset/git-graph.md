---
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
'@mermaid-js/language-server': patch
'@mermaid-js/language-service-codemirror': patch
'@mermaid-js/language-service-monaco': patch
---

feat: git graphs (`gitGraph`, LR, TB and BT) render as SVG through `mermaid`, with the gitGraph geometry and paint theme variables (`gitCommitRadius`, `gitLaneShift`, `gitBranchLabelPaddingX`/`Y`, `gitBranchLabelRadius`, `gitBranchLabelShiftX`, `gitBranchLabelOffsetY`, `gitArrowWidth`, `gitHighlightInnerSize`, `gitMergeRadius`, `gitReverseCrossSize`, `gitCherryPickDotRadius`, `gitNodeColors`, `gitPaletteColors`, `commitLineColor`, `gitCherryPickInk`) in every theme, the `gitGraph` config section honoured where v12 12.2.0 reads it, and the gitGraph language facet and highlighters in the language service, server and editor adapters. MIGRATION.md lists what differs from v12.
