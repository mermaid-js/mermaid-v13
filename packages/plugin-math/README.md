# @mermaid-js/plugin-math (v13 alpha)

TeX math in Mermaid v13 labels: text between `$$` delimiters is typeset by MathJax into plain SVG paths. MathJax is loaded only for a diagram that has math, so a page without math never downloads it. Text output (`format: 'ascii'`) does not typeset math.

```js
import mermaid from 'mermaid';
import { math } from '@mermaid-js/plugin-math';

await mermaid.registerExternalDiagrams([math]); // not needed when discovered on install

const { svg } = await mermaid.render('id', 'flowchart LR\n  A["$$x^2$$"] --> B');
```

Install `@mermaid-js/plugin-math@v13-alpha` together with the newest `mermaid@v13-alpha`.

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
