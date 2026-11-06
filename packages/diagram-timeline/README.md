# @mermaid-js/diagram-timeline (v13 alpha)

The timeline plugin for Mermaid v13: parser, model, layout and SVG renderer for `timeline` (`LR` and `TD`), plus the language facet at `@mermaid-js/diagram-timeline/language`. There is no text output (`format: 'ascii'`) for timelines.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-timeline@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { timeline } from '@mermaid-js/diagram-timeline';

const mermaid = createMermaid({ diagrams: [timeline] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
