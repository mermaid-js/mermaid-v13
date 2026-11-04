# @mermaid-js/diagram-sequence (v13 alpha)

The sequence diagram plugin for Mermaid v13: parser, model, layout and SVG renderer, plus text output from `@mermaid-js/diagram-sequence/ascii` and the language facet at `@mermaid-js/diagram-sequence/language`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-sequence@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { sequence } from '@mermaid-js/diagram-sequence';

const mermaid = createMermaid({ diagrams: [sequence] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
