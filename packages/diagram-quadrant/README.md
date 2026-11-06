# @mermaid-js/diagram-quadrant (v13 alpha)

The quadrant chart plugin for Mermaid v13: parser, model, layout and SVG renderer for `quadrantChart`, plus the language facet at `@mermaid-js/diagram-quadrant/language`. There is no text output (`format: 'ascii'`) for quadrant charts.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-quadrant@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { quadrant } from '@mermaid-js/diagram-quadrant';

const mermaid = createMermaid({ diagrams: [quadrant] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
