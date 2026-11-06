import type { QuadrantModel } from './model.ts';

/**
 * Every text the renderer lays out as a label (`DiagramPlugin.labels`, D178, D225): the title,
 * the quadrant labels, the axis labels and the point labels, as written. An extension that
 * loads an engine for a delimiter (math's `$$`) scans these.
 */
export function quadrantLabels(model: QuadrantModel): readonly string[] {
  const out: string[] = [];
  if (model.title) out.push(model.title);
  for (const q of model.quadrants) if (q?.text) out.push(q.text);
  for (const axis of [model.xAxis, model.yAxis])
    for (const t of [axis?.start, axis?.end]) if (t?.text) out.push(t.text);
  for (const p of model.points) if (p.label.text) out.push(p.label.text);
  return out;
}
