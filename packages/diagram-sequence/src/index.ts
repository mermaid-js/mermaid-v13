/**
 * `@mermaid-js/diagram-sequence`: the sequence diagram plugin (spec #125).
 * The plugin export and manifest land with the tickets of that spec.
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import type { SequenceModel } from './model.ts';
import type { SequenceLayout } from './layout/index.ts';

export type * from './model.ts';
export {
  layoutSequence,
  sequenceLayoutViolations,
  type SequenceLayout,
  type SequenceLayoutContext,
} from './layout/index.ts';
export {
  detectSequence,
  JISON_NAMES,
  parseSequence,
  SequenceTokenKind,
  sequenceTokens,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export type { SequenceParseOptions, SequenceParseResult, SequenceToken } from './parser/index.ts';

/** The plugin's contract. */
export type SequencePlugin = DiagramPlugin<SequenceModel, SequenceLayout>;
