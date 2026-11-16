---
'mermaid': patch
---

feat(slim): `createMermaid({ diagrams })` in `mermaid/slim` also takes an object keyed by first-party diagram id whose values are plugin objects or loaders, `{ flowchart: () => import('@mermaid-js/diagram-flowchart') }`. A loader runs on the first render of its type, so a bundler puts each diagram in its own chunk (D587, part of #867).
