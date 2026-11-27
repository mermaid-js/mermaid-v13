import type { LabelSource } from '@mermaid-js/core/text';
import { readLabel, type MarkdownWarningContext } from '@mermaid-js/core/text/markdown-warning';

/**
 * How the effect, a cause or a sub-cause is read (#1368), in SVG and in text alike. The parser
 * keeps each line as written, so the handler finds a line that is wholly a quoted markdown
 * string itself; with `markdownAlwaysOn` every line is markdown. A plain line that holds an
 * emphasis pair gives the render its `MARKDOWN_NOT_READ` warning.
 */
export const ishikawaLabelSource = (text: string, ctx: MarkdownWarningContext): LabelSource =>
  readLabel(text, undefined, ctx);
