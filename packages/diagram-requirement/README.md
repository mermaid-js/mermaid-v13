# @mermaid-js/diagram-requirement (v13 alpha)

The requirement diagram plugin for Mermaid v13: lexer, parser, model, layout and SVG renderer for `requirementDiagram` (and v12's bare `requirement`), with v12's boxes, relations and markers, its own theme table (`requirementBackground`, `requirementBorderColor`, `relationColor`, …), the language facet at `@mermaid-js/diagram-requirement/language`, and text output (`format: 'ascii'`) from the lazily loaded `@mermaid-js/diagram-requirement/ascii` entry.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-requirement@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { requirement } from '@mermaid-js/diagram-requirement';

const mermaid = createMermaid({ diagrams: [requirement] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
