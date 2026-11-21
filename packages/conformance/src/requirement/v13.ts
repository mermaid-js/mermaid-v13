/**
 * The v13 side of requirement parity: the requirement parser and the normaliser from its
 * `RequirementModel` to the {@link RequirementSnapshot} that `v12.ts` takes from mermaid\@12's
 * `RequirementDB`: the requirement and element maps, the relations, the classes, the
 * direction, the accessible title and description, and each box's `cssStyles` and classes in
 * order (the front-matter title is left out, as `v12.ts` says).
 */
import { detectRequirement, parseRequirement } from '@mermaid-js/diagram-requirement';
import type { RequirementModel } from '@mermaid-js/diagram-requirement';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { REQUIREMENT_V12_TYPES, requirementV12Snapshot } from './v12.ts';
import type { RequirementSnapshot } from './v12.ts';

export function requirementV13Snapshot(model: RequirementModel): RequirementSnapshot {
  return {
    requirements: model.requirements.map((r) => ({
      name: r.name,
      type: r.kind,
      requirementId: r.requirementId,
      text: r.text,
      risk: r.risk,
      verifyMethod: r.verifyMethod,
      docRef: null,
      cssStyles: [...r.styles],
      classes: [...r.classes],
    })),
    elements: model.elements.map((e) => ({
      name: e.name,
      type: e.type,
      requirementId: null,
      text: null,
      risk: null,
      verifyMethod: null,
      docRef: e.docRef,
      cssStyles: [...e.styles],
      classes: [...e.classes],
    })),
    relations: model.relations.map((r) => ({ type: r.kind, src: r.src, dst: r.dst })),
    classes: model.classes.map((c) => ({
      id: c.name,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
    direction: model.direction,
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export const parseRequirementForParity = (text: string): RequirementModel =>
  parseForParity(text, parseRequirement);

export const requirementAdapter: DiagramAdapter<RequirementModel> = {
  id: 'requirement',
  v12Types: REQUIREMENT_V12_TYPES,
  detect: (text) => detectRequirement(text),
  parse: parseRequirementForParity,
  normaliseV13: requirementV13Snapshot,
  normaliseV12: requirementV12Snapshot,
};
