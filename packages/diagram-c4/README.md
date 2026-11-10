# @mermaid-js/diagram-c4 (v13 alpha)

The C4 diagram plugin for Mermaid v13: lexer, parser, model, the grid layout with its relation router and the SVG renderer for `C4Context`, `C4Container`, `C4Component`, `C4Dynamic` and `C4Deployment`, plus the language facet at `@mermaid-js/diagram-c4/language`. Text output (`format: 'ascii'`) is the lazily loaded `@mermaid-js/diagram-c4/ascii` entry.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-c4@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { c4 } from '@mermaid-js/diagram-c4';

const mermaid = createMermaid({ diagrams: [c4] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
