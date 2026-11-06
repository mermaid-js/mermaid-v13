# @mermaid-js/plugin-hand-drawn (v13 alpha)

The hand-drawn look for Mermaid v13: node, group and edge outlines sketched with roughjs, using a fixed seed so the same diagram always draws the same way. Without the plugin, `look: handDrawn` draws the plain diagram and warns `LOOK_REMOVED`.

```js
import mermaid from 'mermaid';
import { handDrawn } from '@mermaid-js/plugin-hand-drawn';

await mermaid.registerExternalDiagrams([handDrawn]); // not needed when discovered on install
mermaid.initialize({ handDrawn: true }); // v12's `look: handDrawn` also works
```

Coming from v12: [the migration guide](https://github.com/mermaid-js/mermaid-v13/blob/mermaid-v13/v13/docs/MIGRATION.md#hand-drawn-look).

Install `@mermaid-js/plugin-hand-drawn@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
