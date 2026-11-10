/**
 * `@mermaid-js/diagram-c4`: the C4 diagram plugin (spec #522): the plugin itself, the parser,
 * its model and AST, the lexer, the layout, and the codes of the diagnostics and
 * warnings it raises. Text output is the `./ascii` entry (#545).
 */
export { c4 } from './plugin.ts';
export { C4TokenKind, c4Tokens, detectC4, JISON_NAMES, parseC4 } from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
export { C4_ELEMENT_KINDS, parentAlias } from './model.ts';
export { layoutC4, type C4LayoutContext } from './layout/index.ts';
export type * from './layout/types.ts';
export { C4_CONFIG_DEFAULTS } from './config.ts';
export {
  C4_BOUNDARY_CYCLE,
  C4_COLOR_INVALID,
  C4_CONFIG_IGNORED,
  C4_DIRECTION,
  C4_NAME_RESERVED,
  C4_NAMED_ARGUMENT_MOVED,
  C4_OFFSET_INVALID,
  C4_STRUCTURE_KEPT,
  C4_UNKNOWN_END,
} from './codes.ts';
