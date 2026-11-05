// The R-PLUG-4 one-flowchart page: `mermaid` from the installed tarballs, one flowchart.
import { render } from 'mermaid';

const status = document.getElementById('status');

render('flow', 'flowchart LR\n  A[Start] --> B{Choice}\n  B --> C[Done]\n')
  .then((result) => {
    document.getElementById('diagram').innerHTML = result.svg;
    status.textContent = `rendered ${result.diagramType}`;
  })
  .catch((error) => {
    status.textContent = `failed: ${error instanceof Error ? error.message : String(error)}`;
  });
