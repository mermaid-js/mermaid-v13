/**
 * The smoke render every CI runtime runs (DESIGN §15 item 14): one fixture through the public
 * `render()` of the built `mermaid` package, bundled into one ES module by `smoke/build.ts`.
 * Importing the module renders; it throws (rejects) unless the SVG is inert and well-formed
 * with no warnings, and leaves the summary on `globalThis.mermaidSmoke`.
 */
import { assertInert } from '@mermaid-js/core/svg';
import { render } from 'mermaid';

export const SMOKE_TEXT = 'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[(Done)]\n';

const result = await render('smoke', SMOKE_TEXT);
assertInert(result.svg);
if (!result.svg.startsWith('<svg') || result.warnings.length > 0 || !(result.width > 0)) {
  throw new Error(`smoke render failed: ${JSON.stringify(result.warnings)}`);
}
const summary = `smoke render ok: ${result.diagramType} ${result.width}x${result.height}`;
(globalThis as { mermaidSmoke?: string }).mermaidSmoke = summary;
console.log(summary);
