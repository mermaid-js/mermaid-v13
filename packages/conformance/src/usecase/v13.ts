/**
 * The v13 side of usecase parity: the usecase parser and the normaliser from its `UsecaseModel`
 * to the {@link UsecaseSnapshot} that `v12.ts` takes from mermaid\@12's usecase DB.
 */
import { detectUsecase, parseUsecase } from '@mermaid-js/diagram-usecase';
import type { UsecaseModel } from '@mermaid-js/diagram-usecase';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { USECASE_V12_TYPES, usecaseV12Snapshot } from './v12.ts';
import type { UsecaseSnapshot } from './v12.ts';

export function usecaseV13Snapshot(model: UsecaseModel): UsecaseSnapshot {
  return structuredClone({
    actors: model.actors.map((a) => ({
      id: a.id,
      label: a.label,
      labelType: a.labelType,
      type: a.type,
      icon: a.icon,
      business: a.business,
      stereotype: a.stereotype,
      parentId: a.parentId,
      classes: a.classes,
      styles: a.styles,
    })),
    useCases: model.useCases.map((u) => ({
      id: u.id,
      label: u.label,
      labelType: u.labelType,
      shape: u.shape,
      business: u.business,
      stereotype: u.stereotype,
      parentId: u.parentId,
      classes: u.classes,
      styles: u.styles,
    })),
    boundaries: model.boundaries.map((b) => ({
      id: b.id,
      label: b.label,
      labelType: b.labelType,
      type: b.type,
      members: b.members,
      classes: b.classes,
      styles: b.styles,
    })),
    relationships: model.relationships.map((r) => ({
      id: r.id,
      explicitId: r.explicitId,
      source: r.source,
      target: r.target,
      type: r.type,
      arrowType: r.arrowType,
      label: r.label,
      labelType: r.labelType,
      minlen: r.minlen,
      classes: r.classes,
      styles: r.styles,
      animate: r.animate,
      animation: r.animation,
    })),
    notes: model.notes.map((n) => ({
      id: n.id,
      target: n.target,
      label: n.label,
      labelType: n.labelType,
    })),
    jsonNodes: model.jsonTables.map((j) => ({
      id: j.id,
      value: j.value,
      propertyOrder: j.propertyOrder,
      classes: j.classes,
      styles: j.styles,
    })),
    classDefs: model.classDefs.map((c) => ({ id: c.id, styles: c.styles })),
    direction: model.direction,
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  });
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseUsecaseForParity(text: string): UsecaseModel {
  const pre = preprocess(text);
  const result = parseUsecase(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const usecaseAdapter: DiagramAdapter<UsecaseModel> = {
  id: 'usecase',
  v12Types: USECASE_V12_TYPES,
  detect: (text) => detectUsecase(text),
  parse: parseUsecaseForParity,
  normaliseV13: usecaseV13Snapshot,
  normaliseV12: usecaseV12Snapshot,
};
