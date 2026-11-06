# @mermaid-js/diagram-pie (v13 alpha)

The pie chart plugin for Mermaid v13: parser, model, layout and SVG renderer for `pie`, plus the language facet at `@mermaid-js/diagram-pie/language`. There is no text output (`format: 'ascii'`) for pie charts.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-pie@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { pie } from '@mermaid-js/diagram-pie';

const mermaid = createMermaid({ diagrams: [pie] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
