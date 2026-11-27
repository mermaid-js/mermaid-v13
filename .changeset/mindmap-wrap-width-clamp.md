---
'@mermaid-js/diagram-mindmap': patch
'@mermaid-js/core': patch
---

fix: `mindmap.maxNodeWidth` is clamped to 120 to 1200 with a `MINDMAP_CONFIG_IGNORED` warning when it is outside that range, and wraps every node shape, as the config reference now says.
