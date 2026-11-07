# @mermaid-js/diagram-cynefin (v13 alpha)

The Cynefin diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for `cynefin-beta`, plus the language facet at `@mermaid-js/diagram-cynefin/language`. There is no text output (`format: 'ascii'`) for Cynefin diagrams.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-cynefin@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { cynefin } from '@mermaid-js/diagram-cynefin';

const mermaid = createMermaid({ diagrams: [cynefin] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
