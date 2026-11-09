/**
 * Treemap names (D401, D408): what `isValidId` accepts. Section and leaf names are always
 * quoted, so the service checks them itself (no quote of their kind, no line break) and reads
 * the rename back; the facet answers only for class names. The lexer decides: a class name is
 * valid when, read where `:::` expects one, it is one `ID2` token over all of it, so a name
 * starting with a digit or with the keyword `treemap` or `title` (v12's lexer reads the keyword
 * first, so `titles` is `title` and `s`) is refused. It must also be two characters or more,
 * which `classDef` needs (D401), and not a statement word (`classDef`, `accTitle`,
 * `accDescr`), which the next line can turn into a statement.
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { treemapCategories } from '../generated/categories.ts';
import { lex } from '../parser/lexer.ts';
import { T } from '../parser/tokens.ts';

const BEFORE = 'treemap\n"a":::';
/** Words the lexer reads as a name alone but that start a statement with what follows. */
const STATEMENT_WORDS = new Set(['classDef', 'accTitle', 'accDescr']);
/** Kinds whose token is a keyword (`:keyword` in the grammar file). */
const KEYWORDS = new Set<number>(
  Object.values(T).filter((k) => treemapCategories[k] === 'Keyword')
);
const LETTERS = 'a class name is ASCII letters, digits and `_`, and does not start with a digit';

/** Why `name` cannot be a treemap name of `kind` (`class` or `node`), if it cannot. */
export function nameReason(name: string, kind = 'class'): string | undefined {
  // A `node` name is always written in quotes: the service checks what may go between them.
  if (kind !== 'class') return undefined;
  if (name === '') return 'A name cannot be empty.';
  const src = `${BEFORE}${name}\n`;
  const tokens = lex(src, 0, sourceView(src, 0, []));
  const from = BEFORE.length;
  const to = from + name.length;
  let j = 0;
  while (j < tokens.length && (tokens.end[j] ?? 0) <= from) j++;
  const k = tokens.kind[j] ?? Kind.EOF;
  const end = tokens.end[j] ?? 0;
  const whole = (tokens.start[j] ?? 0) === from && end === to;
  if (k === T.Id && whole) {
    if (STATEMENT_WORDS.has(name)) return `\`${name}\` is a keyword, so it cannot be a class name.`;
    if (name.length < 2) {
      return `\`${name}\` has one character, and class names need two characters or more.`;
    }
    return undefined;
  }
  if (KEYWORDS.has(k)) {
    const word = src.slice(tokens.start[j] ?? 0, end);
    return end < to
      ? `\`${name}\` starts with the keyword \`${word}\`, and a class name cannot.`
      : `\`${name}\` is a keyword, so it cannot be a class name.`;
  }
  if (k === T.Number) return `\`${name}\` starts with a digit, and a class name cannot.`;
  return `\`${name}\` is not a class name: ${LETTERS}.`;
}
