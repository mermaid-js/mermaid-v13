/**
 * Value conversion as v12 ran it for cynefin (parser-method §3): Langium's default string
 * converter for item and transition labels, and `common/valueConverter.ts` for `title`,
 * `accTitle` and `accDescr`, then commonDb's setters. Every input is a token's text as v12's
 * lexer read it (`cook()`ed). The same `common.langium` terminals as pie's, so the same code
 * (a diagram package never imports another; sharing it would be a core change, #461).
 *
 * The scans are linear (R-PARSE-7, pitfall 5): v12's `/\s+$/gm` backtracks over a long blank
 * run inside a line, so it is written out by hand here.
 */
export { stringValue as labelValue } from '@mermaid-js/shared/parser/rule';

/**
 * Whether a string token, as written, is a markdown string (#1368): a backtick right inside each
 * quote and none between them. Its value keeps the backticks, as v12's did, and the parser marks
 * the label, since without its quotes a label in backticks is plain text (#1368).
 */
export const isMarkdownString = (image: string): boolean => RE_MARKDOWN_STRING.test(image);
const RE_MARKDOWN_STRING = /^(["'])`[^`]*`\1$/;
