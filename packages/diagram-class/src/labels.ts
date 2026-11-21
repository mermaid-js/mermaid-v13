import { classTitle } from './layout/box.ts';
import type { ClassModel } from './parser/model.ts';
import { memberLabel } from './parser/member.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178), as it measures
 * them: class titles, annotations, members, notes, interfaces, relation labels and
 * multiplicities, and namespace titles. Links and tooltips are not labels.
 */
export function classLabels(model: ClassModel): readonly string[] {
  const out: string[] = [];
  for (const ns of model.namespaces) out.push(ns.label, ns.id);
  for (const node of model.classes) {
    out.push(classTitle(node), ...node.annotations.map((a) => `«${a}»`));
    for (const m of [...node.attributes, ...node.methods]) out.push(memberLabel(m));
  }
  for (const note of model.notes) out.push(note.text);
  for (const iface of model.interfaces) out.push(iface.label);
  for (const rel of model.relations) {
    if (rel.label !== undefined) out.push(rel.label);
    for (const end of [rel.start, rel.end])
      if (end.multiplicity !== undefined) out.push(end.multiplicity);
  }
  return out;
}
