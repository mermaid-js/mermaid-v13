/**
 * Value conversion as v12 ran it (parser-method §3): Langium's default string converter for
 * field labels (`packet/module.ts` uses `CommonValueConverter`, which hands `STRING` to it), and
 * `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then commonDb's setters. Every input is a token's text as v12's lexer read it (`cook()`ed).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
export {
  accDescrValue,
  accTitleValue,
  stringValue as labelValue,
  titleValue,
} from '@mermaid-js/core/parser-kit';
