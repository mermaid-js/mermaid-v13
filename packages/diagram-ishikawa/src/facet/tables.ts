/**
 * The ishikawa facet's shared helpers (DESIGN §4.5). The keywords are the parser's
 * (`parser/keywords.ts`); their docs come from the grammar file (`generated/docs.ts`).
 */
export { lineBefore } from '@mermaid-js/shared/parser/facet';
export { span } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/** A line break: what a cause, one line, cannot hold (CR and CRLF read as LF; U+2028/9). */
export const LINE_BREAK = /[\n\r\u2028\u2029]/;
