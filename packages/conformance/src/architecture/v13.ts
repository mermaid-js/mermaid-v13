/**
 * The v13 side of architecture parity: the architecture parser and the normaliser from its
 * `ArchitectureModel` to the {@link ArchitectureSnapshot} that `v12.ts` takes from mermaid\@12's
 * architecture DB.
 */
import { detectArchitecture, parseArchitecture } from '@mermaid-js/diagram-architecture';
import type { ArchitectureModel } from '@mermaid-js/diagram-architecture';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { ARCHITECTURE_V12_TYPES, architectureV12Snapshot } from './v12.ts';
import type { ArchitectureSnapshot } from './v12.ts';

export function architectureV13Snapshot(model: ArchitectureModel): ArchitectureSnapshot {
  return {
    groups: model.groups.map((g) => ({ id: g.id, icon: g.icon, title: g.title, in: g.in })),
    services: model.services.map((s) => ({
      id: s.id,
      icon: s.icon,
      iconText: s.iconText,
      title: s.title,
      in: s.in,
    })),
    junctions: model.junctions.map((j) => ({ id: j.id, in: j.in })),
    edges: model.edges.map((e) => ({
      lhsId: e.lhsId,
      lhsDir: e.lhsDir,
      lhsInto: e.lhsInto,
      lhsGroup: e.lhsGroup,
      rhsId: e.rhsId,
      rhsDir: e.rhsDir,
      rhsInto: e.rhsInto,
      rhsGroup: e.rhsGroup,
      title: e.title,
    })),
    alignments: model.alignments.map((a) => ({ direction: a.direction, members: [...a.members] })),
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs in the architecture package.
 */
export function parseArchitectureForParity(text: string): ArchitectureModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseArchitecture(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const architectureAdapter: DiagramAdapter<ArchitectureModel> = {
  id: 'architecture',
  v12Types: ARCHITECTURE_V12_TYPES,
  detect: (text) => detectArchitecture(text),
  parse: parseArchitectureForParity,
  normaliseV13: architectureV13Snapshot,
  normaliseV12: architectureV12Snapshot,
};
