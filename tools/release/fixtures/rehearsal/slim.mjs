// Scenario "pick your diagrams": `mermaid/slim` with only the flowchart package.
import assert from 'node:assert/strict';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { ascii } from '@mermaid-js/diagram-flowchart/ascii';
import { createMermaid, MermaidError } from 'mermaid/slim';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)';
const mermaid = createMermaid({ diagrams: [{ ...flowchart, ascii }] });

const { svg } = await mermaid.render('a', FLOW);
assert.match(svg, /^<svg[\s>]/);
const { text } = await mermaid.render('b', FLOW, { format: 'ascii' });
assert.match(text, /Start/);

await assert.rejects(
  createMermaid().render('c', FLOW),
  (e) => e instanceof MermaidError && e.code === 'UNSUPPORTED_DIAGRAM'
);
assert.equal(
  createMermaid({ diagrams: [flowchart] }).supportsFormat('flowchart-v2', 'ascii'),
  false
);

console.log(`slim ok on node ${process.version}`);
