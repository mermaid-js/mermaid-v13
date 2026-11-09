import type { XyChartModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178, D385): the title, the
 * axis titles, the categories, the plot names (the legend's) and the line point labels, as
 * written. Tick numbers and data labels are plain text.
 */
export function xyChartLabels(model: XyChartModel): readonly string[] {
  const out: string[] = [];
  if (model.title) out.push(model.title);
  const { xAxis, yAxis } = model;
  if (xAxis.title) out.push(xAxis.title);
  if (xAxis.kind === 'band') out.push(...xAxis.categories);
  if (yAxis.title) out.push(yAxis.title);
  for (const p of model.plots) {
    if (p.name) out.push(p.name);
    for (const l of p.pointLabels ?? []) if (l) out.push(l);
  }
  return out;
}
