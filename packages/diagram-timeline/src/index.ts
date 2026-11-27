/**
 * `@mermaid-js/diagram-timeline`: the timeline diagram plugin (spec #291): the plugin export
 * (`timeline`), the lexer, parser, layout and SVG renderer entries, the model and AST types,
 * and the codes of the warnings its renderer raises. The package's `mermaid` manifest registers
 * it, with `./language` as the language facet.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import type { TimelineModel } from './model.ts';
import type { TimelineLayout } from './layout/index.ts';

export type * from './model.ts';
export * from './layout/index.ts';
export * from './render/index.ts';
export { timeline } from './plugin.ts';
export { TIMELINE_PALETTE_IGNORED } from './codes.ts';
export {
  detectTimeline,
  JISON_NAMES,
  parseTimeline,
  TimelineTokenKind,
  timelineTokens,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export type { TimelineParseOptions, TimelineParseResult, TimelineToken } from './parser/index.ts';

/** The plugin's contract. */
export type TimelinePlugin = DiagramPlugin<TimelineModel, TimelineLayout>;
