# mermaid (v13 alpha)

> [!WARNING]
> This is an **alpha** of Mermaid v13. Don't use it in production. APIs, output and defaults can change between alpha builds, so pin an exact version. `mermaid@latest` is still v12.

Mermaid v13 renders without a browser DOM: in Node, Deno, web workers and browsers. Its output is deterministic, and it has no third-party runtime dependencies. Flowchart is the only diagram type with a v13 renderer so far.

## Everything

```bash
npm install mermaid@v13-alpha --save-exact
```

```js
import mermaid from 'mermaid';

const { svg } = await mermaid.render('id', 'flowchart LR\n  A --> B');
const { text } = await mermaid.render('id', 'flowchart LR\n  A --> B', { format: 'ascii' });
```

Every first-party diagram type is included. Bundlers split each type into its own chunk, so a page downloads only the types it renders.

The size budget is in [`size-budget.json`](./size-budget.json): core, everything the `mermaid` entry loads before any diagram chunk, is at most 98 KB gzip, and core plus flowchart, as loaded for one flowchart render, at most 145 KB gzip.

## Pick your diagrams

`mermaid/slim` is the same API without the first-party diagrams. Only the diagrams you pass in are bundled. Each package has its own version. The newest `mermaid@v13-alpha` depends on the newest `@v13-alpha` of each diagram package, so install them together:

```bash
npm install mermaid@v13-alpha @mermaid-js/diagram-flowchart@v13-alpha --save-exact
```

```js
import { createMermaid } from 'mermaid/slim';
import { flowchart } from '@mermaid-js/diagram-flowchart';
// Only if you need text output:
import { ascii } from '@mermaid-js/diagram-flowchart/ascii';

const mermaid = createMermaid({ diagrams: [{ ...flowchart, ascii }] });
const { svg } = await mermaid.render('id', 'flowchart LR\n  A --> B');
```

To load each diagram on first use, pass loaders keyed by diagram id instead. A loader runs when a diagram of that type is first rendered, never at `createMermaid`, and a bundler puts each in a chunk of its own. Objects and loaders mix, and a key that is not a first-party id is an error:

```js
import { createMermaid } from 'mermaid/slim';
import { pie } from '@mermaid-js/diagram-pie';

const mermaid = createMermaid({
  diagrams: {
    flowchart: () => import('@mermaid-js/diagram-flowchart'),
    sequence: () => import('@mermaid-js/diagram-sequence'),
    pie,
  },
});
```

A loader that fails, or that resolves to a module without that diagram's plugin, rejects the render with an error naming the id (a failed load is tried again on the next render). For text output, resolve to the module with its hook added: `() => import('@mermaid-js/diagram-flowchart').then(async (m) => ({ ...m, ascii: (await import('@mermaid-js/diagram-flowchart/ascii')).ascii }))`. Before the first load, `supportsFormat` answers from the diagram's manifest.

Other diagram types are still detected, and reject with an `UNSUPPORTED_DIAGRAM` error. `mermaid/slim` has no default instance and does not render `.mermaid` elements on page load: call `mermaid.run()` yourself.

## Command line

```bash
npx mermaid@v13-alpha render diagram.mmd --format ascii
```

## Feedback

[Open an issue](https://github.com/mermaid-js/mermaid/issues/new/choose) with **v13** in the title, the exact alpha build (`npm ls mermaid`) and the diagram source.
