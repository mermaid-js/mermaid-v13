/**
 * `@mermaid-js/diagram-c4`: the C4 diagram plugin (spec #522): the parser, its model and AST,
 * the lexer, the layout, and the codes of the diagnostics and warnings it raises. The renderer,
 * plugin export and manifest land with the other tickets of that spec.
 */
export { C4TokenKind, c4Tokens, detectC4, JISON_NAMES, parseC4 } from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
export { parentAlias } from './model.ts';
export {
  c4RelationPath,
  C4_METRICS,
  layoutC4,
  shapeOf,
  stereotypeText,
  type C4LayoutContext,
  type C4PathCommand,
} from './layout/index.ts';
export type * from './layout/types.ts';
export {
  C4_CONFIG_DEFAULTS,
  C4_ELEMENT_KINDS,
  c4Fonts,
  c4LayoutConfig,
  type C4Fonts,
  type C4LayoutConfig,
} from './config.ts';
export {
  C4_BOUNDARY_CYCLE,
  C4_DIRECTION,
  C4_NAME_RESERVED,
  C4_NAMED_ARGUMENT_MOVED,
  C4_OFFSET_INVALID,
  C4_STRUCTURE_KEPT,
  C4_UNKNOWN_END,
} from './codes.ts';
