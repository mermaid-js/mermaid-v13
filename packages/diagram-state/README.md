# @mermaid-js/diagram-state (v13 alpha)

The state diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for both `stateDiagram` and `stateDiagram-v2`, plus the language facet at `@mermaid-js/diagram-state/language`. There is no text output (`format: 'ascii'`) for state diagrams.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-state@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { state } from '@mermaid-js/diagram-state';

const mermaid = createMermaid({ diagrams: [state] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
