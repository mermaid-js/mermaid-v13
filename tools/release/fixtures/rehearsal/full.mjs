// Scenario "everything": `npm install mermaid@v13-alpha`, the snippets of the alpha guide as written.
import assert from 'node:assert/strict';
import mermaid, { MermaidError } from 'mermaid';

mermaid.initialize({ theme: 'default' });

const { svg, width, height, warnings } = await mermaid.render(
  'my-diagram',
  `flowchart LR
    A[Start] --> B{Works?}
    B -- Yes --> C[Ship it]
    B -- No --> D[File an issue]`
);
assert.match(svg, /^<svg[\s>]/);
assert.ok(width > 0 && height > 0, 'width and height');
assert.ok(Array.isArray(warnings), 'warnings');

const { text } = await mermaid.render('id', 'flowchart LR\n  A --> B', { format: 'ascii' });
assert.match(text, /A/);

// A type every build still detects but has no renderer for yet; change it when requirement is ported.
await assert.rejects(
  mermaid.render('u', 'requirementDiagram\n  requirement R {\n    id: 1\n  }\n'),
  (e) => e instanceof MermaidError && e.code === 'UNSUPPORTED_DIAGRAM'
);
await assert.rejects(
  mermaid.render('s', 'flowchart LR\n  A --> B[unclosed'),
  (e) => e instanceof MermaidError && e.code === 'SYNTAX' && e.line > 0 && e.column > 0
);
for (const f of ['render', 'parse', 'initialize', 'run', 'mount', 'detectType', 'supportsFormat'])
  assert.equal(typeof mermaid[f], 'function', f);

console.log(`full ok on node ${process.version}`);
