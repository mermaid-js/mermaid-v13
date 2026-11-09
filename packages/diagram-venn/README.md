# @mermaid-js/diagram-venn (v13 alpha)

The Venn diagram plugin for Mermaid v13: parser, model, layout (a port of venn.js 2.0.0's area-proportional solver) and SVG renderer for `venn-beta`, plus the language facet at `@mermaid-js/diagram-venn/language`. There is no text output (`format: 'ascii'`) for Venn diagrams.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-venn@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { venn } from '@mermaid-js/diagram-venn';

const mermaid = createMermaid({ diagrams: [venn] });
```

The solver's files carry the notices of venn.js (MIT) and fmin (BSD-3-Clause); see `THIRD_PARTY_NOTICES`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
