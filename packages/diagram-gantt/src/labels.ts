import type { GanttModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178), as written: the
 * title, the section names and the task texts (`vert` markers included). Tick labels come from
 * the axis format, accessibility text is no label.
 */
export function ganttLabels(model: GanttModel): readonly string[] {
  return [
    ...(model.title === undefined ? [] : [model.title]),
    ...model.sections.map((s) => s.text),
    ...model.tasks.map((t) => t.text),
  ];
}
