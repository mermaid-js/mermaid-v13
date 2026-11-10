# @mermaid-js/diagram-treeview (v13 alpha)

The tree view plugin for Mermaid v13: parser, model, row layout and SVG renderer for `treeView-beta` (box-drawn input as `tree` prints it included), text output at `@mermaid-js/diagram-treeview/ascii` (`format: 'ascii'`), and the language facet at `@mermaid-js/diagram-treeview/language`. The built-in file and folder icons are drawn by the package; other icons (`icon(pack:name)`, `defaultIconPack`, the icon maps) need an icons extension such as `@mermaid-js/plugin-icons`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-treeview@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { treeView } from '@mermaid-js/diagram-treeview';

const mermaid = createMermaid({ diagrams: [treeView] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
