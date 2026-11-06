/**
 * `@mermaid-js/diagram-gantt`: the gantt diagram plugin (spec #293). The tickets fill it in:
 * dates and axis (#376), lexer (#377), parser and model (#378), schedule and layout (#379),
 * SVG renderer (#381), language facet (#382) and the manifest (#385).
 */
import type { DiagramPlugin } from '@mermaid-js/core';
import type { GanttLayout } from './layout/index.ts';
import type { GanttModel } from './model.ts';

/** The plugin's contract. */
export type GanttPlugin = DiagramPlugin<GanttModel, GanttLayout>;

export {
  detectGantt,
  ganttTokens,
  GanttTokenKind,
  JISON_NAMES,
  parseGantt,
} from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
export {
  GANTT_BAD_DURATION,
  GANTT_CONFIG_IGNORED,
  GANTT_ERROR_CODES,
  GANTT_EXCLUDES_NOT_DRAWN,
  GANTT_METRICS,
  GANTT_TICK_INTERVAL_IGNORED,
  GANTT_UNKNOWN_TASK,
  ganttLayoutViolations,
  layoutGantt,
} from './layout/index.ts';
export type * from './layout/index.ts';
export { schedule, ScheduleError } from './schedule/index.ts';
export { renderGantt, type GanttRenderContext } from './render/index.ts';
export { gantt } from './plugin.ts';
export type {
  Schedule,
  ScheduledTask,
  ScheduleErrorKind,
  ScheduleInput,
  ScheduleOptions,
  ScheduleTask,
} from './schedule/index.ts';
