import { angled, linesOf } from './layout/prepare.ts';
import type { RequirementModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): each box's
 * `<<Kind>>`, name and body lines, each relation's `<<kind>>` and the front-matter title.
 */
export function requirementLabels(model: RequirementModel): readonly string[] {
  const out: string[] = [];
  const box = (lines: ReturnType<typeof linesOf>): void => {
    out.push(lines.kind, lines.name[0], ...lines.body.map(([, text]) => text));
  };
  for (const r of model.requirements) box(linesOf({ is: 'requirement', box: r }));
  for (const e of model.elements) box(linesOf({ is: 'element', box: e }));
  for (const r of model.relations)
    if (r.from !== undefined && r.to !== undefined) out.push(angled(r.kind));
  if (model.title?.trim()) out.push(model.title.trim());
  return out;
}
