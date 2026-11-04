# @mermaid-js/diagram-flowchart (v13 alpha)

The flowchart diagram plugin for Mermaid v13: parser, model, layout and SVG renderer, plus text output from `@mermaid-js/diagram-flowchart/ascii`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-flowchart@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { flowchart } from '@mermaid-js/diagram-flowchart';

const mermaid = createMermaid({ diagrams: [flowchart] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
