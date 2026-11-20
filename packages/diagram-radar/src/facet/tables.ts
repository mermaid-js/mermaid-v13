/**
 * The radar facet's completion table and shared helpers (DESIGN §4.5, D95). Keyword docs are
 * not here: they come from the grammar file (`generated/docs.ts`).
 */
import type { TypedKeywordItem } from '@mermaid-js/shared/parser/facet';
import type { RadarAxisNode, RadarDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
export { tokenBefore } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/** An item offered when the parser expects `kind`. */
export interface KeywordItem extends TypedKeywordItem {
  /** Offered only as the first word of its line (the statements). */
  readonly lineStart?: true;
}

const statement = (kind: number, label: string, insert = `${label} `): KeywordItem => ({
  kind,
  label,
  item: 'keyword',
  insert,
  lineStart: true,
});

/** Everything completion offers but axis names, in the order it is offered. */
export const ITEMS: readonly KeywordItem[] = [
  { kind: T.RadarBeta, label: 'radar-beta', item: 'keyword' },
  statement(T.Axis, 'axis'),
  statement(T.Curve, 'curve'),
  statement(T.Title, 'title'),
  statement(T.AccTitle, 'accTitle', 'accTitle: '),
  // `accDescr` takes one line or a block: both forms are offered.
  statement(T.AccDescr, 'accDescr:', 'accDescr: '),
  statement(T.AccDescr, 'accDescr {', 'accDescr { }'),
  statement(T.ShowLegend, 'showLegend'),
  statement(T.Ticks, 'ticks'),
  statement(T.Max, 'max'),
  statement(T.Min, 'min'),
  statement(T.Graticule, 'graticule'),
  { kind: T.Boolean, label: 'true', item: 'constant' },
  { kind: T.Boolean, label: 'false', item: 'constant' },
  { kind: T.GraticuleValue, label: 'circle', item: 'constant' },
  { kind: T.GraticuleValue, label: 'polygon', item: 'constant' },
];

/**
 * The declared axes by name, in the order the names are first declared; each name's `axis`
 * statements in source order, the first its definition (D358).
 */
export function declaredAxes(doc: RadarDocument): Map<string, RadarAxisNode[]> {
  const out = new Map<string, RadarAxisNode[]>();
  for (const n of doc.children) {
    if (n.type !== 'Axis') continue;
    const list = out.get(n.name);
    if (list) list.push(n);
    else out.set(n.name, [n]);
  }
  return out;
}
