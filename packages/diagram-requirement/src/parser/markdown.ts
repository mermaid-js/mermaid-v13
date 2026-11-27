// The markdown strings of a requirement diagram (D731, #1368). The parser drops a quoted text's
// quotes, as v12 did, so a markdown string `"`…`"` reaches the model as `` `…` ``; the model
// marks it (`RequirementBox.markdown`) for the label handler, which reads it as markdown.
import type { MarkdownField } from '../model.ts';
import type { RequirementText } from './ast.ts';

// A quoted text whose whole is one pair of backticks with none inside.
const RE_MARKDOWN_STRING = /^`[^`]*`$/;

/** Whether a name or value was written as a markdown string. */
export const markdownString = (t: RequirementText): boolean =>
  t.quoted && RE_MARKDOWN_STRING.test(t.text);

/** A box's `markdown` mark: its name first, then its fields; nothing when no text is one. */
export function markdownOf(
  name: RequirementText,
  body: { readonly markdown: readonly MarkdownField[] } | undefined
): { markdown?: MarkdownField[] } {
  const markdown: MarkdownField[] = markdownString(name) ? ['name'] : [];
  markdown.push(...(body?.markdown ?? []));
  return markdown.length > 0 ? { markdown } : {};
}
