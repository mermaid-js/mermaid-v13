import type { StateModel } from './parser/index.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): state names and
 * descriptions, transition labels and notes, as written. Links are not labels.
 */
export function stateLabels(model: StateModel): readonly string[] {
  return [
    ...model.states.flatMap((s) => [s.id, ...s.descriptions, s.descriptions.join('\n')]),
    ...model.transitions.map((t) => t.label),
    ...model.notes.map((n) => n.text),
  ];
}
