# @mermaid-js/plugin-interactions (v13 alpha)

Brings back the v12 click callbacks (`click A callback`, `call fn()`) as a Mermaid v13 extension plugin. Links (`click A "url"`) work without it.

```js
import mermaid from 'mermaid';
import { interactions } from '@mermaid-js/plugin-interactions';

await mermaid.registerExternalDiagrams([interactions]);
```

Install `@mermaid-js/plugin-interactions@alpha` together with the newest `mermaid@alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
