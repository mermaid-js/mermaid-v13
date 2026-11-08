/**
 * The v13 side of sankey parity: the sankey parser and the normaliser from its `SankeyModel` to
 * the {@link SankeySnapshot} that `v12.ts` takes from mermaid\@12's `getGraph()`.
 */
import { detectSankey, parseSankey } from '@mermaid-js/diagram-sankey';
import type { SankeyModel } from '@mermaid-js/diagram-sankey';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { SANKEY_V12_TYPES, sankeyV12Snapshot } from './v12.ts';
import type { SankeySnapshot } from './v12.ts';

export function sankeyV13Snapshot(model: SankeyModel): SankeySnapshot {
  return {
    nodes: model.nodes.map((n) => ({ id: n.id })),
    links: model.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseSankeyForParity(text: string): SankeyModel {
  const pre = preprocess(text);
  const result = parseSankey(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const sankeyAdapter: DiagramAdapter<SankeyModel> = {
  id: 'sankey',
  v12Types: SANKEY_V12_TYPES,
  detect: (text) => detectSankey(text),
  parse: parseSankeyForParity,
  normaliseV13: sankeyV13Snapshot,
  normaliseV12: sankeyV12Snapshot,
};
