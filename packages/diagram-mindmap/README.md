# @mermaid-js/diagram-mindmap (v13 alpha)

The mindmap plugin for Mermaid v13: parser, model, layout and SVG renderer for `mindmap`, plus the language facet at `@mermaid-js/diagram-mindmap/language`. Mindmaps are laid out with core's two-sided `tree` engine (`@mermaid-js/core/layout/tree`) unless config names another engine. There is no text output (`format: 'ascii'`) for mindmaps.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-mindmap@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { mindmap } from '@mermaid-js/diagram-mindmap';

const mermaid = createMermaid({ diagrams: [mindmap] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
