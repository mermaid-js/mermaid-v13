# @mermaid-js/diagram-sankey (v13 alpha)

The sankey diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for `sankey` (and `sankey-beta`), with d3-sankey 0.12.3's layout re-implemented (no dependency), a gradient per link by default, `nodeColors` and both label styles, plus the language facet at `@mermaid-js/diagram-sankey/language`. SVG only: `format: 'ascii'` throws `UnsupportedFormatError`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-sankey@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { sankey } from '@mermaid-js/diagram-sankey';

const mermaid = createMermaid({ diagrams: [sankey] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
