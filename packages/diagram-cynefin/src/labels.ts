import { ITEMS } from './layout/metrics.ts';
import type { CynefinModel } from './model.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): the title, each
 * drawn item (confusion's first three; the rest are a `+N more` badge) and each transition
 * label, as written. The fixed domain texts and `+N more` are plain constants (D363).
 */
export function cynefinLabels(model: CynefinModel): readonly string[] {
  return [
    ...(model.title === undefined ? [] : [model.title]),
    ...model.domains.flatMap((d) =>
      (d.name === 'confusion' ? d.items.slice(0, ITEMS.maxConfusion) : d.items).map((i) => i.label)
    ),
    ...model.transitions.flatMap((t) => (t.label ? [t.label] : [])),
  ];
}
