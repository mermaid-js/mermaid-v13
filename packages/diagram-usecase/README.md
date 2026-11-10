# @mermaid-js/diagram-usecase (v13 alpha)

The usecase diagram plugin for Mermaid v13: lexer, parser, model, layout and SVG renderer for `usecase-beta`, plus the language facet at `@mermaid-js/diagram-usecase/language`. It lays out with the pipeline's engine (`layered` unless `layout` names `elk` or `compass`) and sketches with `@mermaid-js/plugin-hand-drawn` when that is registered. Text output (`format: 'ascii'`) is the lazily loaded `@mermaid-js/diagram-usecase/ascii` entry, which an SVG render never loads.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-usecase@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { usecase } from '@mermaid-js/diagram-usecase';

const mermaid = createMermaid({ diagrams: [usecase] });
```

The edge route drawing is ported from Pele (MIT); see `THIRD_PARTY_NOTICES`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
