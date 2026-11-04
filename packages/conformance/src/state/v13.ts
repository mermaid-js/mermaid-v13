/**
 * The v13 side of state parity: the state plugin's parse and the normaliser from its
 * `StateModel` to the {@link StateSnapshot} that `v12.ts` takes from mermaid@12's `StateDB`.
 */
import { detectState, parseState } from '@mermaid-js/diagram-state';
import type { StateModel } from '@mermaid-js/diagram-state';
import type { DiagramAdapter } from '../types.ts';
import { STATE_V12_TYPES, stateV12Snapshot, userClasses } from './v12.ts';
import type { StateSnapshot } from './v12.ts';

export function stateV13Snapshot(model: StateModel): StateSnapshot {
  return {
    direction: model.direction,
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    states: model.states.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.descriptions.length > 0 ? [...s.descriptions] : [s.id],
      parent: s.parent,
      classes: userClasses(s.classes.join(' ')),
      styles: [...s.styles],
      dir: s.kind === 'composite' ? (s.dir ?? 'TB') : undefined,
    })),
    regions: model.regions.map((r) => ({ id: r.id, parent: r.parent, dir: r.dir ?? 'TB' })),
    transitions: model.transitions.map((t) => ({ from: t.from, to: t.to, label: t.label })),
    notes: model.notes.map((n) => ({ target: n.target, side: n.side, text: n.text })),
    classes: model.classes.map((c) => ({
      id: c.id,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
    links: model.links.map((l) => [l.id, l.url, l.tooltip]),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseStateForParity(text: string): StateModel {
  const result = parseState(text);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const stateAdapter: DiagramAdapter<StateModel> = {
  id: 'state',
  v12Types: STATE_V12_TYPES,
  detect: (text) => detectState(text),
  parse: parseStateForParity,
  normaliseV13: stateV13Snapshot,
  normaliseV12: stateV12Snapshot,
};
