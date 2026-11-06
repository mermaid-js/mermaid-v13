/**
 * `@mermaid-js/diagram-kanban`: the kanban diagram plugin (spec #424). The parser, its model
 * and AST, and the lexer are here; the layout, renderer, plugin export and manifest land with
 * the other tickets of that spec.
 */
export {
  detectKanban,
  JISON_NAMES,
  KanbanTokenKind,
  kanbanTokens,
  parseKanban,
} from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
