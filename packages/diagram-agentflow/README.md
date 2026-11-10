# @mermaid-js/diagram-agentflow (v13 alpha)

The agentflow diagram plugin for Mermaid v13: lexer, parser, model, the layout and the SVG renderer for `agentflow-beta`, with its six vertex shapes (task, tool, input, decision, refdoc, action), connectors, flows and collapsed-flow cards, `global` blocks, the three link semantics (`-->`, `--x`, `-.-`) and v12's kind and flow palette, plus `semanticModel()` for tool builders and the language facet at `@mermaid-js/diagram-agentflow/language`. Text output (`format: 'ascii'`, both charsets) is the lazily loaded `@mermaid-js/diagram-agentflow/ascii` entry: each kind as flowchart's text form, flows as frames with their title, collapsed flows as boxes marked `+`.

`mermaid` already includes it. Install it yourself only when you use `mermaid/slim`. `@mermaid-js/diagram-agentflow@v13-alpha` is the version the newest `mermaid@v13-alpha` depends on:

```js
import { createMermaid } from 'mermaid/slim';
import { agentflow } from '@mermaid-js/diagram-agentflow';

const mermaid = createMermaid({ diagrams: [agentflow] });
```

> [!WARNING]
> Alpha: APIs can change between builds. Pin an exact version.
