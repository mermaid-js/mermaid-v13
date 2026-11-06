/**
 * `@mermaid-js/diagram-kanban`: the kanban diagram plugin (spec #424). The lexer is here; the
 * parser, model, layout, renderer, plugin export and manifest land with the other tickets of
 * that spec.
 */
export { JISON_NAMES, KanbanTokenKind, kanbanTokens } from './parser/index.ts';
export type { KanbanToken } from './parser/index.ts';
