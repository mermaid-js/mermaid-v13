/**
 * The v13 side of agentflow parity: the agentflow parser and its pure `semanticModel()`
 * (D465), normalised to the {@link AgentflowSnapshot} that `v12.ts` takes from mermaid\@12's
 * `getSemanticModel()`.
 */
import { parseAgentflow, semanticModel } from '@mermaid-js/diagram-agentflow';
import type { AgentflowModel } from '@mermaid-js/diagram-agentflow';
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { AGENTFLOW_V12_TYPES, agentflowV12Snapshot, sortDiagnostics } from './v12.ts';
import type { AgentflowSnapshot } from './v12.ts';

/** JSON's view of a value: what the oracle's objects and v13's compare as. */
const plain = <V>(value: V): V => JSON.parse(JSON.stringify(value)) as V;

export function agentflowV13Snapshot(model: AgentflowModel): AgentflowSnapshot {
  const m = semanticModel(model);
  return {
    direction: m.direction ?? null,
    vertices: plain(m.vertices),
    edges: plain(m.edges),
    subGraphs: plain(m.subGraphs),
    connectors: plain(m.connectors),
    diagnostics: sortDiagnostics(m.diagnostics.map((d) => ({ ...d, nodeId: d.nodeId ?? null }))),
    styling: plain({
      accTitle: model.accTitle,
      accDescr: model.accDescr,
      classes: model.classes,
      vertices: model.vertices.map((v) => ({ id: v.id, styles: v.styles, classes: v.classes })),
      edges: model.edges.map((e) => ({
        id: e.id,
        classes: e.classes,
        style: e.style ?? null,
        interpolate: e.interpolate ?? null,
      })),
    }),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export const parseAgentflowForParity = (text: string): AgentflowModel =>
  parseForParity(text, parseAgentflow);

/** v12's `afDetector`: `agentflow-beta` after the front matter, directives and comments. */
export function detectAgentflow(text: string): boolean {
  const pre = preprocess(text);
  return /^agentflow-beta\b/.test(text.slice(diagramStart(text, pre)));
}

export const agentflowAdapter: DiagramAdapter<AgentflowModel> = {
  id: 'agentflow',
  v12Types: AGENTFLOW_V12_TYPES,
  detect: detectAgentflow,
  parse: parseAgentflowForParity,
  normaliseV13: agentflowV13Snapshot,
  normaliseV12: agentflowV12Snapshot,
};
