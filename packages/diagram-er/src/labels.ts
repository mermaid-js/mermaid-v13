import { genericType } from './layout/prepare.ts';
import type { ErModel } from './parser/index.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): entity names and
 * aliases, attribute cells, relationship labels and subgraph titles, as measured.
 */
export function erLabels(model: ErModel): readonly string[] {
  return [
    ...model.entities.flatMap((e) => [
      e.alias || e.name,
      ...e.attributes.flatMap((a) => [genericType(a.type), a.name, a.keys.join(','), a.comment]),
    ]),
    ...model.relationships.map((r) => r.label),
    ...model.subgraphs.map((s) => s.title),
  ];
}
