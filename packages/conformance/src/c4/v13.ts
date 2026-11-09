/**
 * The v13 side of C4 parity: the C4 parser and the normaliser from its `C4Model` to the
 * {@link C4Snapshot} that `v12.ts` takes from mermaid\@12's DB: each item's set fields and
 * `extra` names together by name, the parent boundary by alias (`global` at the top level), the
 * row counts with v12's DB defaults (4 and 2) where `UpdateLayoutConfig` gave none.
 */
import { detectC4, parentAlias, parseC4 } from '@mermaid-js/diagram-c4';
import type { C4Boundary, C4Element, C4Extra, C4Model, C4Relation } from '@mermaid-js/diagram-c4';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { DiagramAdapter } from '../types.ts';
import { C4_V12_TYPES, c4V12Snapshot } from './v12.ts';
import type { C4Fields, C4Snapshot } from './v12.ts';

const ELEMENT_FIELDS = [
  'label',
  'descr',
  'techn',
  'type',
  'sprite',
  'tags',
  'link',
  'bgColor',
  'fontColor',
  'borderColor',
  'shadowing',
  'shape',
  'legendText',
  'legendSprite',
] as const;
const RELATION_FIELDS = [
  'label',
  'descr',
  'techn',
  'sprite',
  'tags',
  'link',
  'textColor',
  'lineColor',
] as const;

function fields(
  item: C4Element | C4Boundary | C4Relation,
  names: readonly string[],
  extra: readonly C4Extra[]
): C4Fields {
  const out: C4Fields = {};
  const record = item as unknown as Record<string, unknown>;
  for (const name of names) {
    const v = record[name];
    if (typeof v === 'string') out[name] = v;
  }
  for (const e of extra) out[e.name] = e.value;
  // Names are unique; sorted as v12's `Object.keys(…).sort()`.
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function c4V13Snapshot(model: C4Model): C4Snapshot {
  const parent = (i: number) => parentAlias(model, i);
  return {
    type: model.c4Type ?? '',
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    shapeInRow: model.shapeInRow ?? 4,
    boundaryInRow: model.boundaryInRow ?? 2,
    shapes: model.elements.map((e) => ({
      alias: e.alias,
      kind: e.kind,
      parent: parent(e.parent),
      fields: fields(e, ELEMENT_FIELDS, e.extra),
    })),
    boundaries: model.boundaries.map((b) => ({
      alias: b.alias,
      parent: parent(b.parent),
      nodeKind: b.nodeKind ?? null,
      fields: fields(b, ELEMENT_FIELDS, b.extra),
    })),
    rels: model.relations.map((r) => ({
      kind: r.kind,
      from: r.from,
      to: r.to,
      offsetX: r.offsetX ?? 0,
      offsetY: r.offsetY ?? 0,
      fields: fields(r, RELATION_FIELDS, r.extra),
    })),
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is the model's when the text has none (D453), where v12 ignored it (its DB
 * has no `setDiagramTitle`): a listed divergence.
 */
export function parseC4ForParity(text: string): C4Model {
  const pre = preprocess(text);
  const result = parseC4(text, { preprocessed: pre });
  const error = [...pre.diagnostics, ...result.diagnostics].find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const c4Adapter: DiagramAdapter<C4Model> = {
  id: 'c4',
  v12Types: C4_V12_TYPES,
  detect: (text) => detectC4(text),
  parse: parseC4ForParity,
  normaliseV13: c4V13Snapshot,
  normaliseV12: c4V12Snapshot,
};
