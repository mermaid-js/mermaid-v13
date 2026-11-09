/**
 * `@mermaid-js/diagram-ishikawa`: the ishikawa (fishbone) diagram plugin (spec #519). The
 * lexer is here; the parser, model, layout, renderer, plugin export and manifest land with the
 * other tickets of that spec.
 */
export { ishikawaTokens, IshikawaTokenKind, JISON_NAMES } from './parser/index.ts';
export type { IshikawaToken } from './parser/index.ts';
