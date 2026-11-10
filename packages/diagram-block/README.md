# @mermaid-js/diagram-block (v13 alpha)

The block diagram plugin for Mermaid v13: lexer, parser, model, the column-grid layout and the SVG renderer for `block` (and `block-beta`), with block arrows, composites, spaces, spans, straight clipped edges and the composite palette, plus the language facet at `@mermaid-js/diagram-block/language` and text output (`format: 'ascii'`) from `@mermaid-js/diagram-block/ascii`, which loads only for a text render.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-block@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { block } from '@mermaid-js/diagram-block';

const mermaid = createMermaid({ diagrams: [block] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
