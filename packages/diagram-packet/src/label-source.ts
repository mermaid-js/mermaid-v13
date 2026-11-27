import type { LabelSource } from '@mermaid-js/core/text';
import { readLabel, type MarkdownWarningContext } from '@mermaid-js/core/text/markdown-warning';
import type { PacketField } from './model.ts';

/**
 * How a field label or the title is read (#1368), in SVG and in text alike. A field the parser
 * marked as a markdown string is read as markdown without its backticks. The title keeps its
 * quotes, so the handler finds a markdown string in it itself. A plain label with an emphasis
 * pair gives the render its `MARKDOWN_NOT_READ` warning.
 */
export function packetLabelSource(
  label: string | PacketField,
  ctx: MarkdownWarningContext
): LabelSource {
  if (typeof label === 'string') return readLabel(label, {}, ctx);
  const markdown = label.markdown === true;
  return readLabel(markdown ? label.label.slice(1, -1) : label.label, { markdown }, ctx);
}
