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

/** The plugin's contract. */
export type SequencePlugin = DiagramPlugin<SequenceModel, SequenceLayout>;
