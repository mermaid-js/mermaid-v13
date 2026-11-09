# @mermaid-js/diagram-xychart (v13 alpha)

The XY chart plugin for Mermaid v13: parser, model, layout and SVG renderer for `xychart` (and `xychart-beta`), plus the language facet at `@mermaid-js/diagram-xychart/language`. There is no text output (`format: 'ascii'`) for XY charts.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-xychart@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { xychart } from '@mermaid-js/diagram-xychart';

const mermaid = createMermaid({ diagrams: [xychart] });
```

Its options are v12's `xyChart` config section, read from `initialize()`, front matter and `%%{init}`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
