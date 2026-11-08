/**
 * Which names a venn id may take bare, and how a rename quotes the others (D418, D191, D92).
 *
 * A bare id is one the parser's `isBareId` takes (`parser/text.ts`, the rule messages and hover
 * write ids by): v12's `IDENTIFIER` that no keyword rule takes first, so `Set`, `text-b` and
 * `set-x` and a bare `title` are written quoted. A text node's id may also be a number
 * (`text A 12`, so renaming one back writes it as it was); a `style` target may not, so a
 * rename to a number of a text node a `style` names fails the service's read-back. Any other
 * name is written quoted, `"Ä b"`, which v12 reads as the name once its quotes are removed; a
 * name with a `"` or a line break, or with blanks at either end (v12 trims), cannot be written.
 */
import { isBareId, isIdentifier } from '../parser/text.ts';

/** Why `name` cannot be written at all, quoted or not; undefined when it can. */
function unwritable(name: string): string | undefined {
  if (name === '' || name !== name.trim() || /["\r\n]/.test(name))
    return `'${name}' cannot be a venn id: an id is not empty and has no \`"\`, no line break and no blank at either end.`;
  return undefined;
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * `undefined` when `name` may be written bare as an id of `kind` (`set`, the default, or
 * `text`), else why not.
 */
export function invalidReason(name: string, kind = 'set'): string | undefined {
  const never = unwritable(name);
  if (never !== undefined) return never;
  if (isBareId(name) || (kind === 'text' && NUMBER.test(name))) return undefined;
  if (!isIdentifier(name)) {
    return `'${name}' is not a bare venn id: one is letters, digits, \`_\` and \`-\`, starting with a letter or \`_\`.`;
  }
  return `'${name}' starts with a venn keyword, so it is read as the keyword.`;
}

/** `name` quoted, as a rename writes it where it cannot go bare; undefined when it cannot. */
export function quotedId(name: string): string | undefined {
  return unwritable(name) === undefined ? `"${name}"` : undefined;
}
