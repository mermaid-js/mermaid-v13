/**
 * `@mermaid-js/diagram-sequence`: the sequence diagram plugin (spec #125): the plugin export
 * (`sequence`), the parser, layout and SVG renderer entries, and the model and AST types. The
 * package's `mermaid` manifest registers it, with `./ascii` and `./language` as the text hook
 * and the language facet.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import type { SequenceModel } from './model.ts';
import type { SequenceLayout } from './layout/index.ts';

export type * from './model.ts';
export { layoutSequence, type SequenceLayout, type SequenceLayoutContext } from './layout/index.ts';
export {
  detectSequence,
  JISON_NAMES,
  parseSequence,
  SequenceTokenKind,
  sequenceTokens,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export { sequence } from './plugin.ts';
export { renderSequence, type SequenceRenderContext } from './render/index.ts';
export type { SequenceParseOptions, SequenceParseResult, SequenceToken } from './parser/index.ts';

/** The plugin's contract. */
export type SequencePlugin = DiagramPlugin<SequenceModel, SequenceLayout>;
