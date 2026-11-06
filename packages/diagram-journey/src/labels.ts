import type { JourneyModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178), as written: the
 * title, the section names, the task names and the named actors (the legend; `''` draws
 * nothing, D244).
 */
export function journeyLabels(model: JourneyModel): readonly string[] {
  return [
    ...(model.title === undefined ? [] : [model.title]),
    ...model.sections.map((s) => s.name),
    ...model.tasks.map((t) => t.name),
    ...model.actors.filter((a) => a !== ''),
  ];
}
