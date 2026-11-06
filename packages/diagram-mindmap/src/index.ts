/**
 * `@mermaid-js/diagram-mindmap`: the mindmap diagram plugin (spec #294). The parser, its model
 * and AST, and the lexer are here; the layout, renderer, plugin export and manifest land with
 * the other tickets of that spec.
 */
export {
  detectMindmap,
  JISON_NAMES,
  MindmapTokenKind,
  mindmapTokens,
  parseMindmap,
} from './parser/index.ts';
export type * from './parser/index.ts';
export { MINDMAP_SECTIONS, mindmapSections } from './model.ts';
export type * from './model.ts';
export { mindmapIconName, mindmapIcons } from './icons.ts';
