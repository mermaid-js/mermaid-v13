/**
 * Which names a cause can be renamed to (D497): one line of text that reads back as exactly
 * that cause. A rename changes that label only (causes are `standalone`).
 */
import { parseIshikawa } from '../parser/index.ts';
import { LINE_BREAK } from './tables.ts';

/** The keyword at the start of a line: v12's lexer takes it wherever a token starts. */
const KEYWORD = /^ishikawa\b/i;

/** A line of a cause under an effect, to read `name` back as a cause. */
const BEFORE = 'ishikawa\nEffect\n  ';

/** Whether `name`, written as a cause, reads back as exactly that cause. */
function readsAsCause(name: string): boolean {
  const text = `${BEFORE}${name}\n`;
  const r = parseIshikawa(text);
  if (r.diagnostics.some((d) => d.severity === 'error')) return false;
  const [cause, ...rest] = r.model.causes;
  if (!cause || rest.length > 0 || cause.causes.length > 0 || cause.text !== name) return false;
  return text.slice(cause.range.start, cause.range.end) === name;
}

/** Why `name` cannot be a `kind` name (a cause when omitted), if it cannot. */
export function invalidReason(name: string, kind = 'cause'): string | undefined {
  if (kind !== 'cause') return `'${kind}' is not an ishikawa symbol kind.`;
  if (name.trim() === '') return 'A cause cannot be empty: a blank line is no cause.';
  if (LINE_BREAK.test(name)) return 'A cause is one line: it cannot hold a line break.';
  if (name !== name.trim())
    return 'A cause cannot start or end with a blank: the indent before it sets its depth, and blanks after it are dropped.';
  if (KEYWORD.test(name))
    return 'A cause cannot start with `ishikawa`: a line starting with the keyword is an error. Reword it, as in `The ishikawa way`.';
  if (name.startsWith('%%')) return 'A cause cannot start with `%%`: the line would be a comment.';
  return readsAsCause(name) ? undefined : `'${name}' would not read as that cause.`;
}
