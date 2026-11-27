---
'@mermaid-js/diagram-architecture': patch
'@mermaid-js/core': patch
'@mermaid-js/language-service': patch
'mermaid': patch
---

fix: an architecture diagram that sets one of v12's fcose settings (`randomize`, `nodeSeparation`, `idealEdgeLengthMultiplier`, `edgeElasticity`, `numIter`, `seed`), `architecture.fontSize` or `architecture.useWidth`, which v13 reads nowhere, now gets one `ARCHITECTURE_SETTINGS_IGNORED` warning naming them. These keys no longer have a default in the config schema.
