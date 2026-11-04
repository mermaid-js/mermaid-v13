/**
 * Entity relationship diagram plugin. Imports `@mermaid-js/core` only.
 */
export { erTokens } from './parser/tokens-api.ts';
export type { ErToken } from './parser/tokens-api.ts';
export { JISON_NAMES, jisonName } from './parser/jison-names.ts';
export { T as ErTokenKind } from './parser/tokens.ts';
export { detectEr, parseEr } from './parser/index.ts';
export type * from './parser/index.ts';
export { genericType, layoutEr, prepareEr } from './layout/layout.ts';
export type * from './layout/layout.ts';
