import { labelSource, type LabelConfig, type LabelSource } from '@mermaid-js/core/text';

/**
 * How the effect, a cause or a sub-cause is read (#1368), in SVG and in text alike. The
 * parser keeps each line as written, so the handler finds a line that is wholly a quoted
 * markdown string itself. No ishikawa label kind read markdown in v12 (`v12Markdown: false`).
 */
export const ishikawaLabelSource = (text: string, config: LabelConfig): LabelSource =>
  labelSource(text, { v12Markdown: false }, config);
