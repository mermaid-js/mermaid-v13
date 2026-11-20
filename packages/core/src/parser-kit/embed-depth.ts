/**
 * Embedded diagram blocks (ADR-15): the nesting limit and the missing diagram type, which the
 * render (through the core entry) and the editor (through the parser kit) both report.
 */
import type { Diagnostic } from './diagnostics.ts';
import type { Range } from './positions.ts';

/** How deep blocks may nest: a block in the host is level 1. */
export const MAX_BLOCK_DEPTH = 4;

/** The `mermaid <id>["Title"] {` line of the block whose body starts at `at` in `text`. */
export function openerRange(text: string, at: number): Range {
  const brace = text.lastIndexOf('{', at - 1);
  let start = text.lastIndexOf('\n', brace) + 1;
  while (text[start] === ' ' || text[start] === '\t') start++;
  return { start, end: brace + 1 };
}

/** The error for block `id`, its body at `at` in `text`, nested over {@link MAX_BLOCK_DEPTH}. */
export function tooDeep(text: string, id: string, at: number): Diagnostic {
  return {
    severity: 'error',
    code: 'EMBED_DEPTH',
    message: `The \`mermaid ${id}\` block is nested more than ${MAX_BLOCK_DEPTH} deep.`,
    range: openerRange(text, at),
  };
}

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
