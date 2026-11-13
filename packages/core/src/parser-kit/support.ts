/**
 * The escaping of names inside AST ids, which most hand-written diagram parsers repeat. A
 * subpath of its own, so that only the diagrams that escape ids load it (DESIGN §2).
 */

/** The characters every AST id escapes: the id grammar's own (`%`, `>`, `@`, `#`). */
export const ID_RESERVED = '%>@#';
/** Control characters, lone surrogates and non-characters, which some diagrams escape too. */
export const ID_CONTROL = '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';

const TWO_DIGITS = 0x80;

/**
 * An escaper of names inside AST ids: each UTF-16 unit in `set` (the inside of a regex
 * character class) becomes `%XX` (`%XXXX` from U+0080 on). Diagrams differ in what they
 * escape, so each passes its own set.
 */
export function idEscaper(set: string = ID_RESERVED): (name: string) => string {
  const needs = new RegExp(`[${set}]`, 'u');
  const all = new RegExp(`[${set}]`, 'gu');
  const hex = (c: string): string => {
    const n = c.charCodeAt(0);
    return `%${n
      .toString(16)
      .toUpperCase()
      .padStart(n < TWO_DIGITS ? 2 : 4, '0')}`;
  };
  return (name) => (needs.test(name) ? name.replace(all, hex) : name);
}
