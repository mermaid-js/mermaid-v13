/**
 * `@mermaid-js/diagram-sequence`: the sequence diagram plugin (spec #125).
 * The plugin export and manifest land with the tickets of that spec.
 */
import type { DiagramPlugin } from '@mermaid-js/core';

/** The plugin's contract; the type parameters become `SequenceModel` and `SequenceLayout`. */
export type SequencePlugin = DiagramPlugin<unknown, unknown>;
