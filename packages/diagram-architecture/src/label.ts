import type { LabelSource } from '@mermaid-js/core/text';
import { readLabel, type MarkdownWarningContext } from '@mermaid-js/core/text/markdown-warning';

/**
 * A label or text icon as the model holds it, read by core's label handler (#1368). The model
 * holds a markdown string as v12's DB held it, in its backticks without the quotes, and the
 * parser marks it (`titleMarkdown`, `iconTextMarkdown`): the backticks are taken off here. Bare
 * backticks are not marked, so they are drawn as written.
 */
export const readArchitectureLabel = (
  text: string,
  markdown: true | undefined,
  ctx: MarkdownWarningContext
): LabelSource => readLabel(markdown ? text.slice(1, -1) : text, { markdown }, ctx);
