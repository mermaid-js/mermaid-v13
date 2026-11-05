# @mermaid-js/layout-elk (v13 alpha)

ELK layouts for Mermaid v13, on [elkjs](https://github.com/kieler/elkjs) 0.12.0. The package keeps its v12 name and registration snippet:

```js
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';

mermaid.registerLayoutLoaders(elkLayouts);
```

In Node (SSR), installing the package is enough: `mermaid`'s Node entry finds it in your app's `node_modules` (its `mermaid` manifest) and registers it, `lineHops` included. Bundler discovery is not built yet; there, register it as above.

Then a diagram that names an ELK layout is laid out by ELK:

```
---
config:
  layout: elk
---
flowchart LR
  A --> B
```

- **Names:** `elk` and `elk.layered` (ELK's layered algorithm), `elk.stress`, `elk.force`, `elk.mrtree`, `elk.sporeOverlap`, `elk.box`, `elk.rectpacking` and `elk.radial`. Set one with `layout:` (top level or a diagram's section) or use the `flowchart-elk` header. Flowchart, class, state and ER diagrams take them.
- **No default changes.** Registering the package lays out only the diagrams that name ELK; every other diagram stays on the built-in `layered` engine.
- **Config:** the v12 `elk` section (`mergeEdges`, `preset`, `nodePlacementStrategy`, `cycleBreakingStrategy`, `considerModelOrder`, `lineHops`, `straightenEdges`, `keepEntryNodeOnTop`, `orientFeedbackEdges`, …), with v12 develop's defaults. The keys are known only while the package is registered; the full list is in the config reference.
- **Synchronous.** The engine runs in-process, with no worker and no timer. `render()` loads elkjs the first time a diagram names an ELK layout; `renderSync` works once `prepare()` has loaded it. Web Worker hosts are not supported, as in v12.
- **Text output** (`format: 'ascii'`) always uses the built-in `layered` engine, with one `ASCII_DROPPED` warning for the layout.

Warnings:

| Code | When |
| --- | --- |
| `ELK_NOT_INSTALLED` | A diagram names an ELK layout and this package is not registered. Comes from `mermaid`; the diagram is drawn with `layered`. |
| `ELK_ALGORITHM_IGNORED` | A subgraph sets `@{ algorithm: … }`. Parsed, not applied yet: the subgraph is laid out with the diagram's algorithm. |
| `ELK_RADIAL_NOT_A_TREE` | `elk.radial` on a graph ELK refuses as "not a tree" (a cycle). Drawn with `layered`. |

What differs from v12 is listed in MIGRATION.md under "ELK". Parity is with v12's ELK options, not its pixels.

Licence: MIT. elkjs is `EPL-2.0 OR GPL-3.0-or-later`; see `THIRD_PARTY_NOTICES`.

Install `@mermaid-js/layout-elk@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
