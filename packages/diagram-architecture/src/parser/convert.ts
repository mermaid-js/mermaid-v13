/**
 * Value conversion as v12 ran it (parser-method §3): `ArchitectureValueConverter` for icons and
 * labels, Langium's default string converter for a text icon, and `common/valueConverter.ts` for
 * `title`, `accTitle` and `accDescr`, then commonDb's setters. Every input is a token's text as
 * v12's lexer read it (`cook()`ed). The common ones are `@mermaid-js/shared/parser/common-values`.
 */
export {
  accDescrValue,
  accTitleValue,
  stringValue,
  titleValue,
} from '@mermaid-js/shared/parser/common-values';

/** ARCH_ICON, `(name)`: `input.replace(/[()]/g, '').trim()`; only the outer two can be there. */
export function iconValue(image: string): string {
  return image.slice(1, -1);
}

/**
 * ARCH_TITLE, `[…]`: the brackets off and trimmed; then, when it starts and ends with the same
 * quote, those off (a lone `"` too) and `\"` and `\'` unescaped; trimmed again. Ported line for
 * line, so JS's `trim()` (which takes Unicode blanks) and the lone-quote case stay v12's.
 */
export function labelValue(image: string): string {
  let result = image.slice(1, -1).trim();
  if (
    (result.startsWith('"') && result.endsWith('"')) ||
    (result.startsWith("'") && result.endsWith("'"))
  ) {
    result = result.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return result.trim();
}
