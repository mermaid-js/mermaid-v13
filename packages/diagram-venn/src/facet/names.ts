/**
 * Which names a venn id may take bare, and how a rename quotes the others (D418, D191, D92).
 *
 * A bare id is v12's `IDENTIFIER` (`[A-Za-z_][A-Za-z0-9\-_]*`) that no earlier rule takes:
 * the keywords `set`, `union`, `text`, `style` and `venn-beta` match with `\b` and without
 * regard to case, so `Set`, `text-b` and `style-x` lex as a keyword first; `title` followed by a
 * blank or a line break is a title, so a bare `title` is refused too. A text node's id may be a
 * number (`text A 12`), but a `style` target may not, so a rename quotes a number. Any other
 * name is written quoted, `"Ä b"`, which v12 reads as the name once its quotes are removed; a
 * name with a `"` or a line break, or with blanks at either end (v12 trims), cannot be written.
 */

const BARE_ID = /^[A-Za-z_][A-Za-z0-9\-_]*$/;
/** A keyword at the start, ended by `\b` (a `-` ends it too). */
const KEYWORD_FIRST = /^(?:set|union|text|style|venn-beta)(?![A-Za-z0-9_])/i;

/** Why `name` cannot be written at all, quoted or not; undefined when it can. */
function unwritable(name: string): string | undefined {
  if (name === '' || name !== name.trim() || /["\r\n]/.test(name))
    return `'${name}' cannot be a venn id: an id is not empty and has no \`"\`, no line break and no blank at either end.`;
  return undefined;
}

/** `undefined` when `name` may be written bare as a set or text node id, else why not. */
export function invalidReason(name: string): string | undefined {
  const never = unwritable(name);
  if (never !== undefined) return never;
  if (!BARE_ID.test(name)) {
    return `'${name}' is not a bare venn id: one is letters, digits, \`_\` and \`-\`, starting with a letter or \`_\`.`;
  }
  if (KEYWORD_FIRST.test(name) || /^title$/i.test(name))
    return `'${name}' starts with a venn keyword, so it is read as the keyword.`;
  return undefined;
}

/** `name` quoted, as a rename writes it where it cannot go bare; undefined when it cannot. */
export function quotedId(name: string): string | undefined {
  return unwritable(name) === undefined ? `"${name}"` : undefined;
}
