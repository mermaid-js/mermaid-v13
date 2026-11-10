# @mermaid-js/diagram-architecture (v13 alpha)

The architecture diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for `architecture-beta`. Services, junctions and groups are placed on a grid from the sides each edge names by core's `compass` engine (no cytoscape, the same layout on every render), and v12's built-in icons (`database`, `server`, `disk`, `internet`, `cloud`, `unknown`, `blank`) are drawn by the package itself. Icons from other packs come through `@mermaid-js/plugin-icons`. SVG only: `format: 'ascii'` throws `UnsupportedFormatError`. The language facet (completion, hover, rename and the rest, for `@mermaid-js/language-service`) is at `@mermaid-js/diagram-architecture/language`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-architecture@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { architecture } from '@mermaid-js/diagram-architecture';

const mermaid = createMermaid({ diagrams: [architecture] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
