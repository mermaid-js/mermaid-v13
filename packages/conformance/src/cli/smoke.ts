/**
 * Smoke render (CI `smoke-render`, node20): one fixture through the public `mermaid` API.
 * Exits non-zero unless it gives an inert, well-formed `<svg>` with no warnings.
 */
import { assertInert } from '@mermaid-js/core/svg';
import { render } from 'mermaid';

const result = await render(
  'smoke',
  'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[(Done)]\n'
);
assertInert(result.svg);
if (!result.svg.startsWith('<svg') || result.warnings.length > 0 || result.width <= 0) {
  process.stderr.write(`smoke render failed: ${JSON.stringify(result.warnings)}\n`);
  process.exit(1);
}
process.stdout.write(`smoke render ok: ${result.diagramType} ${result.width}x${result.height}\n`);
