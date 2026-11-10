import type { AgentflowModel } from './parser/index.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D176, D178): vertex and
 * connector texts, edge texts and flow titles, as written. Tooltips, URLs and the front-matter
 * title (plain text, as v12's `insertTitle` drew it) are not labels.
 */
export function agentflowLabels(model: AgentflowModel): readonly string[] {
  return [
    ...model.vertices.map((v) => v.text),
    ...model.edges.map((e) => e.text),
    ...model.flows.map((f) => f.title),
  ];
}
