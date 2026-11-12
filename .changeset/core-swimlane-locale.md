---
'@mermaid-js/core': patch
'mermaid': patch
---

fix: a swimlane diagram lays out the same in every locale. The swimlane engine broke ties between node ids with `localeCompare` and no locale, so the same source could place nodes in a different order under, say, an Estonian, Czech, Danish or Swedish host or page locale. It now compares ids by code unit.
