# @mermaid-js/diagram-railroad (v13 alpha)

The railroad diagram plugin for Mermaid v13: parsers for v12's four notations (`railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta`) onto one model, v12's railroad layout and an SVG renderer, plus the language facet at `@mermaid-js/diagram-railroad/language`. There is no text output (`format: 'ascii'`) for railroad diagrams yet.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-railroad@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { railroad } from '@mermaid-js/diagram-railroad';

const mermaid = createMermaid({ diagrams: [railroad] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
