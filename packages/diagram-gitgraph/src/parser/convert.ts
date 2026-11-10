/**
 * Value conversion as v12 ran it (parser-method §3): Langium's default string converter for
 * every STRING (ids, messages, tags, quoted names), and `common/valueConverter.ts` for `title`,
 * `accTitle` and `accDescr`, then commonDb's setters (the same code as pie's, which a diagram
 * package cannot import). Every input is a token's text as v12's lexer read it (`cook()`ed).
 * v12's DB then ran `sanitizeText`; v13 keeps the text as written (D263).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
export { accDescrValue, accTitleValue, stringValue, titleValue } from '@mermaid-js/core/parser-kit/rule';
