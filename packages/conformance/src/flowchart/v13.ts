/**
 * The v13 side of flowchart parity: the flowchart plugin's parse and the normaliser from its
 * `FlowModel` to the {@link FlowSnapshot} that `v12.ts` takes from mermaid@12's FlowDB.
 *
 * One difference is bridged here instead of being a divergence: v12 stored click URLs after
 * `@braintree/sanitize-url` (it is not `loose` from diagram text), while v13 keeps the URL as
 * written and checks it when SVG is written. The normaliser applies v12's sanitiser to the
 * v13 URL, so the comparison checks that both read the same URL.
 */
import { sanitizeUrl } from '@braintree/sanitize-url';
import { detectFlowchart, parseFlowchart } from '@mermaid-js/diagram-flowchart';
import type { FlowModel } from '@mermaid-js/diagram-flowchart';
import type { DiagramAdapter } from '../types.ts';
import { FLOWCHART_V12_TYPES, flowchartV12Snapshot } from './v12.ts';
import type { FlowSnapshot } from './v12.ts';

export function flowchartV13Snapshot(model: FlowModel): FlowSnapshot {
  const tips = new Map(model.tooltips);
  const tooltips: [string, string][] = [];
  for (const v of model.vertices) {
    const tip = tips.get(v.id);
    if (tip !== undefined) tooltips.push([v.id, tip]);
  }
  return {
    direction: model.direction,
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    vertices: model.vertices.map((v) => ({
      id: v.id,
      text: v.text,
      type: v.type,
      labelType: v.labelType,
      styles: [...v.styles],
      classes: [...v.classes],
      link: v.link ? sanitizeUrl(v.link) : undefined,
      linkTarget: v.linkTarget,
      props: { ...v.props },
      dir: v.dir,
    })),
    edges: model.edges.map((e) => ({
      start: e.start,
      end: e.end,
      type: e.type,
      stroke: e.stroke,
      length: e.length,
      text: e.text,
      labelType: e.labelType,
      id: e.id,
      classes: [...e.classes],
      style: e.style ? [...e.style] : undefined,
      interpolate: e.interpolate,
    })),
    classes: model.classes.map((c) => ({
      id: c.id,
      styles: [...c.styles],
      textStyles: [...c.textStyles],
    })),
    subGraphs: model.subgraphs.map((s) => ({
      id: s.id,
      title: s.title,
      nodes: [...s.nodes].sort(),
      dir: s.dir,
      classes: [...s.classes],
    })),
    tooltips,
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseFlowchartForParity(text: string): FlowModel {
  const result = parseFlowchart(text);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const flowchartAdapter: DiagramAdapter<FlowModel> = {
  id: 'flowchart',
  v12Types: FLOWCHART_V12_TYPES,
  detect: (text) => detectFlowchart(text) !== undefined,
  parse: parseFlowchartForParity,
  normaliseV13: flowchartV13Snapshot,
  normaliseV12: flowchartV12Snapshot,
};
