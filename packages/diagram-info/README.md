# @mermaid-js/diagram-info (v13 alpha)

The info diagram plugin for Mermaid v13: parser, model and renderer for `info`, which draws the version of `mermaid` (`v13.0.0-alpha.1`, for example), as SVG or as text (`format: 'ascii'`, from `@mermaid-js/diagram-info/ascii`). The language facet is at `@mermaid-js/diagram-info/language`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-info@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { info } from '@mermaid-js/diagram-info';

const mermaid = createMermaid({ diagrams: [info] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
