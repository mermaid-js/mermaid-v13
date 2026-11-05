import type { FlowModel } from './parser/index.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): node texts, edge
 * texts and subgraph titles, as written. Tooltips and URLs are not labels.
 */
export function flowchartLabels(model: FlowModel): readonly string[] {
  return [
    ...model.vertices.map((v) => v.text),
    ...model.edges.map((e) => e.text),
    ...model.subgraphs.map((s) => s.title),
  ];
}
