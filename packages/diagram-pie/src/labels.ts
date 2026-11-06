import type { PieModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): the title and each
 * legend row (`label [value]` under `showData`), as written. The percentages are digits and
 * `%` only, so no extension delimiter can be in them.
 */
export function pieLabels(model: PieModel): readonly string[] {
  return [
    ...(model.title === undefined ? [] : [model.title]),
    ...model.sections.map((s) => (model.showData ? `${s.label} [${s.value}]` : s.label)),
  ];
}
