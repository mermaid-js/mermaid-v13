/**
 * `@mermaid-js/diagram-gantt`: the gantt diagram plugin (spec #293). The tickets fill it in:
 * dates and axis (#376), lexer (#377), parser and model (#378), schedule and layout (#379),
 * SVG renderer (#381), language facet (#382) and the manifest (#385).
 */
import type { DiagramPlugin } from '@mermaid-js/core';

/** The plugin's contract. T2 and T3 replace `unknown` with `GanttModel` and `GanttLayout`. */
export type GanttPlugin = DiagramPlugin<unknown, unknown>;
