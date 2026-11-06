/**
 * `@mermaid-js/diagram-gantt`: the gantt diagram plugin (spec #293). The tickets fill it in:
 * dates and axis (#376), lexer (#377), parser and model (#378), schedule and layout (#379),
 * SVG renderer (#381), language facet (#382) and the manifest (#385).
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import type { GanttModel } from './model.ts';

/** The plugin's contract. T3 replaces `unknown` with `GanttLayout`. */
export type GanttPlugin = DiagramPlugin<GanttModel, unknown>;

export {
  detectGantt,
  ganttTokens,
  GanttTokenKind,
  JISON_NAMES,
  parseGantt,
} from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
