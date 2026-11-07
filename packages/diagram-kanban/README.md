# @mermaid-js/diagram-kanban (v13 alpha)

The kanban diagram plugin for Mermaid v13: parser, model, layout and SVG renderer for `kanban`, with columns, cards, their ticket, assignee and priority, and ticket links from `kanban.ticketBaseUrl`. There is no text output (`format: 'ascii'`) for kanban boards yet.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-kanban@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { kanban } from '@mermaid-js/diagram-kanban';

const mermaid = createMermaid({ diagrams: [kanban] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
