# @mermaid-js/plugin-icons (v13 alpha)

Draws [Iconify](https://iconify.design/) icon packs in Mermaid v13: label icons such as
`fa:fa-car` in every diagram type, the glyphs of flowchart icon shapes
(`A@{ icon: "logos:aws" }`) and mindmap's `::icon(fa fa-book)` and `::icon(mdi:fire)`. Icons are
rebuilt as plain SVG shapes, so a pack cannot put script or styles into a diagram. Without the
plugin, icons are shown as written with an `ICON_NOT_RENDERED` warning, and the SVG is otherwise
the same.

```js
import mermaid from 'mermaid';
import { icons } from '@mermaid-js/plugin-icons';

await mermaid.registerExternalDiagrams([icons]); // not needed when discovered on install
mermaid.registerIconPacks([
  { name: 'fa', loader: () => import('@iconify-json/fa6-solid').then((m) => m.icons) },
  { name: 'logos', loader: () => import('@iconify-json/logos').then((m) => m.icons) },
]);
```

A pack's loader runs only for a diagram that names it. Setup, loading for `renderSync`, warnings
and what an icon may contain: [docs/icons.md](https://github.com/mermaid-js/mermaid-v13/blob/mermaid-v13/v13/docs/icons.md).
Coming from v12: [the migration guide](https://github.com/mermaid-js/mermaid-v13/blob/mermaid-v13/v13/docs/MIGRATION.md#icons).

Install `@mermaid-js/plugin-icons@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
