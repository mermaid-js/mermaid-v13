/**
 * The v13 side of quadrant parity: the quadrant parser and the normaliser from its
 * `QuadrantModel` to the {@link QuadrantSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectQuadrant, parseQuadrant } from '@mermaid-js/diagram-quadrant';
import type { QuadrantModel, QuadrantText } from '@mermaid-js/diagram-quadrant';
import { modelOrThrow } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { QUADRANT_V12_TYPES, quadrantV12Snapshot } from './v12.ts';
import type { QuadrantSnapshot } from './v12.ts';

const plain = (t: QuadrantText | undefined): QuadrantText | null =>
  t ? { text: t.text, markdown: t.markdown } : null;

export function quadrantV13Snapshot(model: QuadrantModel): QuadrantSnapshot {
  const axis = (a: QuadrantModel['xAxis']) =>
    a ? { start: plain(a.start), end: plain(a.end) } : null;
  return {
    // The oracle never passes the front-matter title on (D218: a render spec covers it).
    title: model.titleAst === undefined ? '' : (model.title ?? ''),
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    quadrants: model.quadrants.map(plain),
    xAxis: axis(model.xAxis),
    yAxis: axis(model.yAxis),
    points: model.points.map((p) => ({
      label: plain(p.label) as QuadrantText,
      className: p.className ?? '',
      x: p.x,
      y: p.y,
      styles: { ...p.styles },
    })),
    classes: [...model.classes].map(([name, c]) => [name, { ...c.styles }]),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export const parseQuadrantForParity = (text: string): QuadrantModel =>
  modelOrThrow(parseQuadrant(text));

export const quadrantAdapter: DiagramAdapter<QuadrantModel> = {
  id: 'quadrant',
  v12Types: QUADRANT_V12_TYPES,
  detect: (text) => detectQuadrant(text),
  parse: parseQuadrantForParity,
  normaliseV13: quadrantV13Snapshot,
  normaliseV12: quadrantV12Snapshot,
};
