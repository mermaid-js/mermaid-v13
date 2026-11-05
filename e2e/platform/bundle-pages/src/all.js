// The R-PLUG-4 every-type page: one diagram of each first-party type, each drawn only when
// the test calls `window.renderType(id)`, so the test sees which chunks each render loads.
import { render } from 'mermaid';

const DIAGRAMS = {
  flowchart: 'flowchart LR\n  A --> B\n',
  class: 'classDiagram\n  class Animal\n  Animal <|-- Duck\n',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n',
  sequence: 'sequenceDiagram\n  Alice->>Bob: Hello\n',
  state: 'stateDiagram-v2\n  [*] --> Still\n  Still --> [*]\n',
};

window.diagramIds = Object.keys(DIAGRAMS);
window.renderType = async (id) => {
  const result = await render(`d-${id}`, DIAGRAMS[id]);
  const holder = document.createElement('div');
  holder.id = id;
  holder.innerHTML = result.svg;
  document.getElementById('diagrams').append(holder);
  return result.diagramType;
};
document.getElementById('status').textContent = 'ready';
