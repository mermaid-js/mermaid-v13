# @mermaid-js/diagram-eventmodeling (v13 alpha)

The event modeling plugin for Mermaid v13: parser, model, layout and SVG renderer for `eventmodeling`, plus the language facet at `@mermaid-js/diagram-eventmodeling/language`. There is no text output (`format: 'ascii'`) for event models.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-eventmodeling@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { eventmodeling } from '@mermaid-js/diagram-eventmodeling';

const mermaid = createMermaid({ diagrams: [eventmodeling] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
