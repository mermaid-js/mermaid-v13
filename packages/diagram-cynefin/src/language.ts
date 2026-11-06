/**
 * Cynefin language facet (`@mermaid-js/diagram-cynefin/language`, DESIGN §4.5, R-LANG-8, D89).
 * A stub until T6 (#470) adds the facet; for now it carries the token kinds and the lexer.
 * Nothing reachable from here imports the layout or a renderer.
 */
export { CynefinTokenKind, cynefinTokens } from './parser/index.ts';
export type { CynefinToken } from './parser/index.ts';
