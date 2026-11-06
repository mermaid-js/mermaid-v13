import type { RadarModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178, D355): the title,
 * each axis label, and each curve's legend label under `showLegend`, as written.
 */
export function radarLabels(model: RadarModel): readonly string[] {
  return [
    ...(model.title === undefined ? [] : [model.title]),
    ...model.axes.map((a) => a.label),
    ...(model.options.showLegend ? model.curves.map((c) => c.label) : []),
  ];
}
