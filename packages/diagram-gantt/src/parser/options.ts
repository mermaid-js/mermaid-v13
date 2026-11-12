/** What a gantt parse takes and gives. */
import type { ParseOptions, ParseResult } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { GanttModel } from '../model.ts';
import type { GanttDocument } from './ast.ts';

export interface GanttParseOptions extends ParseOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
  /** The integrator's cap on sections and tasks (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type GanttParseResult = ParseResult<GanttModel, GanttDocument>;
