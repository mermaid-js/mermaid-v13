import type { StateModel } from './parser/index.ts';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): state names and
 * descriptions, transition labels and notes, as written. A state with several descriptions is
 * titled by the first and lists the rest below it as one label. Links are not labels.
 */
export function stateLabels(model: StateModel): readonly string[] {
  return [
    ...model.states.flatMap((s) => [s.id, ...s.descriptions, ...rowsOf(s.descriptions)]),
    ...model.transitions.map((t) => t.label),
    ...model.notes.map((n) => n.text),
  ];
}

/** The rows of a state with several descriptions: every one after the title, as one label. */
const rowsOf = (descriptions: readonly string[]): string[] =>
  descriptions.length > 1 ? [descriptions.slice(1).join('\n')] : [];
