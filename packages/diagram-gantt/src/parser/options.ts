/** What a gantt parse takes and gives. */
import type { ParseOptions, ParseResult } from '@mermaid-js/core/parser-kit';
import type { GanttModel } from '../model.ts';
import type { GanttDocument } from './ast.ts';

export interface GanttParseOptions extends ParseOptions {
  /** The integrator's cap on sections and tasks (core `DEFAULT_LIMITS.maxNodes` when absent, R-SEC-5). */
  maxNodes?: number;
}

export type GanttParseResult = ParseResult<GanttModel, GanttDocument>;
