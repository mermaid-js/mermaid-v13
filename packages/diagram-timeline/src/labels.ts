import type { TimelineModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): the title, section
 * names, periods and events, as written. Accessibility text is not a label.
 */
export function timelineLabels(model: TimelineModel): readonly string[] {
  return [
    ...(model.title === undefined ? [] : [model.title]),
    ...model.sections.map((s) => s.text),
    ...model.periods.flatMap((p) => [p.text, ...p.events.map((e) => e.text)]),
  ];
}
