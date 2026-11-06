# @mermaid-js/diagram-radar (v13 alpha)

The radar chart plugin for Mermaid v13: parser, model, layout and SVG renderer for `radar-beta`. There is no text output (`format: 'ascii'`) for radar charts.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-radar@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { radar } from '@mermaid-js/diagram-radar';

const mermaid = createMermaid({ diagrams: [radar] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
