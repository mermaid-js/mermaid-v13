/**
 * The v13 side of wardley parity: the wardley parser and the normaliser from its `WardleyModel`
 * to the {@link WardleySnapshot} that `v12.ts` takes from mermaid\@12's wardley DB.
 */
import { detectWardley, parseWardley } from '@mermaid-js/diagram-wardley';
import type { WardleyModel } from '@mermaid-js/diagram-wardley';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { WARDLEY_V12_TYPES, wardleyV12Snapshot } from './v12.ts';
import type { WardleySnapshot } from './v12.ts';

export function wardleyV13Snapshot(model: WardleyModel): WardleySnapshot {
  const xy = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });
  return {
    nodes: model.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      x: n.x,
      y: n.y,
      className: n.className,
      labelOffsetX: n.labelOffsetX,
      labelOffsetY: n.labelOffsetY,
      inertia: n.inertia,
      sourceStrategy: n.sourceStrategy,
      inPipeline: n.inPipeline,
      isPipelineParent: n.isPipelineParent,
    })),
    links: model.links.map((l) => ({
      source: l.source,
      target: l.target,
      dashed: l.dashed,
      label: l.label,
      flow: l.flow,
    })),
    trends: model.trends.map((t) => ({ nodeId: t.nodeId, targetX: t.targetX, targetY: t.targetY })),
    pipelines: model.pipelines.map((p) => ({
      nodeId: p.nodeId,
      componentIds: [...p.componentIds],
    })),
    notes: model.notes.map((n) => ({ text: n.text, ...xy(n) })),
    annotations: model.annotations.map((a) => ({ number: a.number, text: a.text, ...xy(a) })),
    annotationsBox: model.annotationsBox && xy(model.annotationsBox),
    accelerators: model.accelerators.map((a) => ({ name: a.name, ...xy(a) })),
    deaccelerators: model.deaccelerators.map((a) => ({ name: a.name, ...xy(a) })),
    evolution: model.evolution && {
      stages: [...model.evolution.stages],
      boundaries: [...model.evolution.boundaries],
    },
    size: model.size && { width: model.size.width, height: model.size.height },
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs (`parser.spec.ts`).
 */
export function parseWardleyForParity(text: string): WardleyModel {
  const pre = preprocess(text);
  const fm = pre.frontMatter && { ...pre.frontMatter, title: undefined };
  const result = parseWardley(text, { preprocessed: { ...pre, frontMatter: fm } });
  const error = [...pre.diagnostics, ...result.diagnostics].find((x) => x.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const wardleyAdapter: DiagramAdapter<WardleyModel> = {
  id: 'wardley',
  v12Types: WARDLEY_V12_TYPES,
  detect: (text) => detectWardley(text),
  parse: parseWardleyForParity,
  normaliseV13: wardleyV13Snapshot,
  normaliseV12: wardleyV12Snapshot,
};
