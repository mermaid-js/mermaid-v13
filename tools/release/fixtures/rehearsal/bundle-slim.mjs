import { createMermaid } from 'mermaid/slim';
import { flowchart } from '@mermaid-js/diagram-flowchart';
const { svg } = await createMermaid({ diagrams: [flowchart] }).render(
  'a',
  'flowchart LR\n  A --> B'
);
document.body.innerHTML = svg;
