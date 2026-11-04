# @mermaid-js/diagram-er (v13 alpha)

The entity relationship diagram plugin for Mermaid v13: parser, model, layout and SVG renderer, plus the language facet at `@mermaid-js/diagram-er/language`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-er@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { er } from '@mermaid-js/diagram-er';

const mermaid = createMermaid({ diagrams: [er] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
