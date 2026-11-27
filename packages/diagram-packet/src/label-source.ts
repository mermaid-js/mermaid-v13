import { labelSource, type LabelConfig, type LabelSource } from '@mermaid-js/core/text';
import type { PacketField } from './model.ts';

/**
 * How a field label or the title is read (D734), in SVG and in text alike. A field the parser
 * marked as a markdown string is read as markdown without its backticks. The title keeps its
 * quotes, so the handler finds a markdown string in it itself. No packet label kind read
 * markdown in v12 (`v12Markdown: false`).
 */
export function packetLabelSource(label: string | PacketField, config: LabelConfig): LabelSource {
  if (typeof label === 'string') return labelSource(label, { v12Markdown: false }, config);
  const markdown = label.markdown === true;
  const text = markdown ? label.label.slice(1, -1) : label.label;
  return labelSource(text, { markdown, v12Markdown: false }, config);
}
