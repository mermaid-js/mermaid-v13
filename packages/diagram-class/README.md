# @mermaid-js/diagram-class (v13 alpha)

The class diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for both `classDiagram` and `classDiagram-v2`, plus the language facet at `@mermaid-js/diagram-class/language`. There is no text output (`format: 'ascii'`) for class diagrams.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-class@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { classDiagram } from '@mermaid-js/diagram-class';

const mermaid = createMermaid({ diagrams: [classDiagram] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
