/**
 * `@mermaid-js/core/parser-kit/embed-type`: the error for an embedded diagram block (ADR-15)
 * with no diagram type, which the render's block pass and the editor both report. A subpath of
 * its own, beside `embed-depth.ts`, so that it loads with the block pass only.
 */
import type { Diagnostic } from './diagnostics.ts';
import type { Range } from './positions.ts';

/**
 * The error for block `id` whose body does not start with a diagram type: `line` is its first
 * diagram line (after blank lines, comments and front matter), at `range`. The render and the
 * editor each find that line in their own text.
 */
export function noDiagramType(id: string, line: string, range: Range): Diagnostic {
  const word = /^[^\s{[(;:]*/.exec(line)![0];
  return {
    severity: 'error',
    code: 'EMBED_NO_TYPE',
    message: `The \`mermaid ${id}\` block must start with a diagram type, such as \`sequenceDiagram\` or \`classDiagram\`, after any blank lines, comments and front matter${word ? `; \`${word}\` is not a diagram type` : ''}.`,
    range,
  };
}
