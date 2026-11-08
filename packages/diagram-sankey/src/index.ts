/**
 * `@mermaid-js/diagram-sankey`: the sankey diagram plugin (spec #427). The lexer is here; the
 * parser, model, layout, renderer, plugin export and manifest land with the other tickets of
 * that spec.
 */
export { JISON_NAMES, SankeyTokenKind, sankeyTokens } from './parser/index.ts';
export type { SankeyToken } from './parser/index.ts';
