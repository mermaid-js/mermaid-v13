/**
 * `@mermaid-js/diagram-ishikawa`: the ishikawa (fishbone) diagram plugin (spec #519): the
 * plugin, the parser, its model and AST, detection, the lexer, the codes of the warnings it
 * raises, the fishbone layout and the renderer. The manifest and config defaults land with T5.
 * What only the conformance gates read is at `./testing`.
 */
export { ishikawa } from './plugin.ts';
export { renderIshikawa, type IshikawaRenderContext } from './render/index.ts';
export {
  detectIshikawa,
  ishikawaTokens,
  IshikawaTokenKind,
  JISON_NAMES,
  parseIshikawa,
} from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
export { ISHIKAWA_EMPTY, ISHIKAWA_INDENT_CLAMPED } from './codes.ts';
export { layoutIshikawa } from './layout/index.ts';
export type * from './layout/index.ts';
