/**
 * The v13 side of mindmap parity: the mindmap parser and the normaliser from its
 * `MindmapModel` to the {@link MindmapSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectMindmap, mindmapSections, parseMindmap } from '@mermaid-js/diagram-mindmap';
import type { MindmapModel } from '@mermaid-js/diagram-mindmap';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { MINDMAP_V12_TYPES, mindmapV12Snapshot } from './v12.ts';
import type { MindmapSnapshot } from './v12.ts';

export function mindmapV13Snapshot(model: MindmapModel): MindmapSnapshot {
  const branch = mindmapSections(model.nodes, 'branch');
  const depth = mindmapSections(model.nodes, 'depth');
  return {
    nodes: model.nodes.map((n, k) => ({
      id: n.id,
      label: n.label,
      shape: n.shape,
      level: n.level,
      parent: n.parent ?? -1,
      classes: [...n.classes],
      icon: n.icon?.text ?? null,
      section: branch[k] ?? null,
      depthSection: depth[k] ?? null,
    })),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseMindmapForParity(text: string): MindmapModel {
  const pre = preprocess(text);
  const result = parseMindmap(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const mindmapAdapter: DiagramAdapter<MindmapModel> = {
  id: 'mindmap',
  v12Types: MINDMAP_V12_TYPES,
  detect: (text) => detectMindmap(text),
  parse: parseMindmapForParity,
  normaliseV13: mindmapV13Snapshot,
  normaliseV12: mindmapV12Snapshot,
};
