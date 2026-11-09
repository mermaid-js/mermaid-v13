/**
 * Wardley names (D423, D427): what `isValidId` accepts as an unquoted node name, and how a
 * rename quotes one it does not. The lexer decides: a name is valid unquoted when the lexer,
 * reading it where a component's name goes and where a link's ends go, gives one name token
 * over all of it. So a keyword or strategy, and a name starting with one (`notebook` is `note`
 * and `book`, `buyer` is `buy` and `er`: keywords have no word boundary), a number, a leading
 * digit and punctuation such as `,` or `[` are refused; inner blanks are allowed (`Cup of Tea`
 * is one name). Every such name can still be written in quotes, so a rename writes it as
 * `"notebook"` ({@link quoteName}).
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { lex } from '../parser/lexer.ts';
import { keywordHint } from '../parser/messages.ts';
import { KEYWORD_PREFIX, NAME_SET } from '../parser/tables.ts';
import { T } from '../parser/tokens.ts';

/** Where a name goes: a component's name, a link's source and a link's target. */
const CONTEXTS: readonly (readonly [before: string, after: string])[] = [
  ['wardley-beta\ncomponent ', ' [0.5, 0.5]\n'],
  ['wardley-beta\n', ' -> B\n'],
  ['wardley-beta\nA -> ', '\n'],
];

const LETTERS =
  'an unquoted name is ASCII letters, digits, blanks, `_`, `-`, `&` and parentheses, with no blank at either end';

/** Why a refused name cannot be quoted either. */
const UNQUOTABLE =
  'Nor can it be quoted: a quoted name has no line break or `\\`, and not both `"` and `\'`.';

/** Why `name` cannot be written unquoted, read between `before` and `after`, if it cannot. */
function readAs(name: string, before: string, after: string): string | undefined {
  const src = `${before}${name}${after}`;
  const tokens = lex(src, 0, sourceView(src, 0, []));
  const from = before.length;
  const to = from + name.length;
  let j = 0;
  while (j < tokens.length && (tokens.end[j] ?? 0) <= from) j++;
  const k = tokens.kind[j] ?? Kind.EOF;
  const start = tokens.start[j] ?? 0;
  const end = tokens.end[j] ?? 0;
  if (NAME_SET[k] === 1 && k !== T.String && start === from && end === to) return undefined;
  if (KEYWORD_PREFIX[k] === 1 && start === from) {
    // A title token holds its line: its keyword is `title`.
    const word = k === T.Title ? 'title' : src.slice(start, Math.min(end, to));
    return `${keywordHint(word, name)}.`;
  }
  if (k === T.Int || k === T.Decimal) {
    return `\`${name}\` starts with a digit, and an unquoted name cannot: quote it, as \`"${name}"\`.`;
  }
  return `\`${name}\` is not an unquoted name: ${LETTERS}.`;
}

/** Why `name` cannot be an unquoted node name, if it cannot (the `kind` is always `node`). */
export function nameReason(name: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  for (const [before, after] of CONTEXTS) {
    const why = readAs(name, before, after);
    if (why === undefined) continue;
    return quoteName(name) === undefined ? `${why} ${UNQUOTABLE}` : why;
  }
  return undefined;
}

/**
 * `name` in quotes, as a rename writes it where it is refused unquoted (D427): in `"…"`, or in
 * `'…'` when it holds a `"`. None for a name that no quotes hold as written: one with both
 * quotes, a `\` (an escape) or a line break.
 */
export function quoteName(name: string): string | undefined {
  if (name === '' || /[\\\r\n]/.test(name)) return undefined;
  if (!name.includes('"')) return `"${name}"`;
  return name.includes("'") ? undefined : `'${name}'`;
}
