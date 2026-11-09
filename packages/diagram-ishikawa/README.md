# @mermaid-js/diagram-ishikawa (v13 alpha)

The Ishikawa (fishbone) diagram plugin for Mermaid v13: parser, model, layout (v12's fishbone geometry) and SVG renderer for `ishikawa` and `ishikawa-beta`, plus the language facet at `@mermaid-js/diagram-ishikawa/language`. There is no text output (`format: 'ascii'`) for Ishikawa diagrams yet.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-ishikawa@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { ishikawa } from '@mermaid-js/diagram-ishikawa';

const mermaid = createMermaid({ diagrams: [ishikawa] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
