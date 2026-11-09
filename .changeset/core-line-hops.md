---
'mermaid': patch
'@mermaid-js/core': patch
'@mermaid-js/layout-elk': patch
---

feat: line hops for every diagram that draws edges (#78). A new top-level `lineHops` key (`false`, `true`, `'arc'` or `'gap'`, default `false`) draws a small arc, or a break, where one edge crosses another: a horizontal run gives way to a vertical one, otherwise the later edge does. `swimlane.lineHops` (default `'arc'`) and `elk.lineHops` (default `true`) still turn hops on under those layouts; a top-level `lineHops: false` turns them off everywhere. The hops live in a lazily loaded part of core, `@mermaid-js/core/layout/hops`, loaded like a lazy layout named `lineHops` when the shared key is on (the `swimlane` and ELK engines carry it, so preloading them is enough): `renderSync` needs `prepare()` or `preload({ layouts: ['lineHops'] })` first. `@mermaid-js/layout-elk` no longer draws hops itself and drops its `postRender` hook, so ELK renders keep the stream writer.
