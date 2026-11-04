/**
 * The v13 side of ER parity: the ER plugin's parse and the normaliser from its `ErModel` to
 * the {@link ErSnapshot} that `v12.ts` takes from mermaid\@12's ErDB.
 */
import { detectEr, parseEr } from '@mermaid-js/diagram-er';
import type { ErModel } from '@mermaid-js/diagram-er';
import type { DiagramAdapter } from '../types.ts';
import { ER_V12_TYPES, erV12Snapshot } from './v12.ts';
import type { ErSnapshot } from './v12.ts';

export function erV13Snapshot(model: ErModel): ErSnapshot {
  return {
    direction: model.direction,
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    entities: model.entities.map((e) => ({
      name: e.name,
      alias: e.alias,
      attributes: e.attributes.map((a) => ({
        type: a.type,
        name: a.name,
        keys: [...a.keys],
        comment: a.comment,
      })),
      classes: [...e.classes],
      styles: [...e.styles],
    })),
    relationships: model.relationships.map((r) => ({
      from: { ...r.from },
      to: { ...r.to },
      identifying: r.identifying,
      label: r.label,
    })),
    subgraphs: model.subgraphs.map((s) => ({
      name: s.name,
      title: s.title,
      members: [...s.members],
      direction: s.direction,
      classes: [...s.classes],
      styles: [...s.styles],
    })),
    classes: model.classes.map((c) => ({
      name: c.name,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseErForParity(text: string): ErModel {
  const result = parseEr(text);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const erAdapter: DiagramAdapter<ErModel> = {
  id: 'er',
  v12Types: ER_V12_TYPES,
  detect: (text) => detectEr(text),
  parse: parseErForParity,
  normaliseV13: erV13Snapshot,
  normaliseV12: erV12Snapshot,
};
