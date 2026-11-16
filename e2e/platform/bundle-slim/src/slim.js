// A slim app with eight lazy first-party diagrams (D587): each diagram is drawn only when the
// test calls `window.renderType(id)`, so the test sees which chunks each render loads.
import { createMermaid } from 'mermaid/slim';

const mermaid = createMermaid({
  diagrams: {
    flowchart: () => import('@mermaid-js/diagram-flowchart'),
    class: () => import('@mermaid-js/diagram-class'),
    er: () => import('@mermaid-js/diagram-er'),
    sequence: () => import('@mermaid-js/diagram-sequence'),
    state: () => import('@mermaid-js/diagram-state'),
    pie: () => import('@mermaid-js/diagram-pie'),
    journey: () => import('@mermaid-js/diagram-journey'),
    timeline: () => import('@mermaid-js/diagram-timeline'),
  },
});

const DIAGRAMS = {
  flowchart: 'flowchart LR\n  A --> B\n',
  class: 'classDiagram\n  class Animal\n  Animal <|-- Duck\n',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n',
  sequence: 'sequenceDiagram\n  Alice->>Bob: Hello\n',
  state: 'stateDiagram-v2\n  [*] --> Still\n  Still --> [*]\n',
  pie: 'pie\n  "a": 1\n  "b": 2\n',
  journey: 'journey\n  title Day\n  section Work\n    Code: 5: Me\n',
  timeline: 'timeline\n  title History\n  2002 : LinkedIn\n',
};

window.renderType = async (id) => {
  const result = await mermaid.render(`d-${id}`, DIAGRAMS[id]);
  const holder = document.createElement('div');
  holder.id = id;
  holder.innerHTML = result.svg;
  document.getElementById('diagrams').append(holder);
  return result.diagramType;
};
document.getElementById('status').textContent = 'ready';
