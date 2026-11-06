# @mermaid-js/diagram-journey (v13 alpha)

The user journey diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for `journey`, plus the language facet at `@mermaid-js/diagram-journey/language`. There is no text output (`format: 'ascii'`) for user journeys.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-journey@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { journey } from '@mermaid-js/diagram-journey';

const mermaid = createMermaid({ diagrams: [journey] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
