# @mermaid-js/diagram-treemap (v13 alpha)

The treemap plugin for Mermaid v13: parser, model, layout and SVG renderer for `treemap` (and the older `treemap-beta`), plus the language facet at `@mermaid-js/diagram-treemap/language`. There is no text output (`format: 'ascii'`) for treemaps.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-treemap@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { treemap } from '@mermaid-js/diagram-treemap';

const mermaid = createMermaid({ diagrams: [treemap] });
```

The squarified tiling and the value formatting are ports of d3-hierarchy and d3-format (ISC); see `THIRD_PARTY_NOTICES`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
