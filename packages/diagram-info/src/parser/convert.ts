/**
 * Value conversion as v12 ran it (parser-method §3): `common/valueConverter.ts` for `title`,
 * `accTitle` and `accDescr`, as pie has it (a copy: diagram packages never import each other).
 * v12's info DB read none of the values; v13 keeps them for the SVG's title and description.
 * Every input is a token's text as v12's lexer read it (`cook()`ed).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
export { accDescrValue, accTitleValue, titleValue } from '@mermaid-js/core/parser-kit/rule';
