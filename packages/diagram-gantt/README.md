# @mermaid-js/diagram-gantt (v13 alpha)

The gantt plugin for Mermaid v13: parser, model, schedule, layout and SVG renderer for `gantt`, plus the language facet at `@mermaid-js/diagram-gantt/language`. There is no text output (`format: 'ascii'`) for gantt charts.

Dates, `today` and the time axis use the host time zone, as in v12. The instant a chart treats as now is the `now` render option (a number or `Date`; `mermaid` defaults it to `Date.now()` at each call), so a test or a server render can pin it.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-gantt@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { gantt } from '@mermaid-js/diagram-gantt';

const mermaid = createMermaid({ diagrams: [gantt] });
const { svg } = await mermaid.render('plan', 'gantt\n  a :a1, 2024-01-01, 3d', { now: Date.now() });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
