# @mermaid-js/diagram-packet (v13 alpha)

The packet diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for `packet` (and the older `packet-beta`), plus the language facet at `@mermaid-js/diagram-packet/language`. There is no text output (`format: 'ascii'`) for packet diagrams yet.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-packet@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { packet } from '@mermaid-js/diagram-packet';

const mermaid = createMermaid({ diagrams: [packet] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
