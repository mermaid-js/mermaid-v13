# @mermaid-js/diagram-gitgraph (v13 alpha)

The git graph plugin for Mermaid v13: parser, model, layout and SVG renderer for `gitGraph` (`LR`, `TB` and `BT`), plus the language facet at `@mermaid-js/diagram-gitgraph/language`. There is no text output (`format: 'ascii'`) for git graphs.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-gitgraph@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { gitGraph } from '@mermaid-js/diagram-gitgraph';

const mermaid = createMermaid({ diagrams: [gitGraph] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
