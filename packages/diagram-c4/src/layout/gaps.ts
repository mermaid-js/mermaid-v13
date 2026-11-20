/**
 * The room relation tags take between two row neighbours (D679, amending D454): the gap between
 * two shapes side by side in a row is at least what the widest tag on the lines between them
 * needs to sit on its line, clear of the arrowhead and the shape at each end. The grid then
 * places the row with that gap (`GridNode.gapAfter`). Only row neighbours in one group are
 * widened: shapes in different boundaries keep the gaps the boundaries give them.
 */
import type { C4Element } from '../model.ts';
import type { GridGroup, GridNode } from './grid.ts';
import { measureLabel, type LabelSetup } from './labels.ts';
import { C4_METRICS as M } from './metrics.ts';

/** An element as the grid places it. */
export interface RowNode extends GridNode {
  readonly element: Pick<C4Element, 'alias'>;
}

/** How far a tag keeps from each end of its line: the arrowhead's square or `tagClear`, and a pixel. */
export const tagEndClear = (): number => Math.max(M.arrow, M.tagClear) + M.tagSlack;

/**
 * Sets `gapAfter` on every element whose row neighbour labelled relations join it to: the widest
 * of their tags and `tagEndClear` at each end. `perRow` is the members of a row; a group laid
 * out in columns (LR, RL) has no row neighbours.
 */
export function widenForLabels(
  groups: readonly GridGroup[],
  nodes: readonly RowNode[],
  perRow: number,
  setup: LabelSetup
): void {
  const widest = widestByPair(setup, nodes);
  for (const g of groups) {
    if (g.direction === 'LR' || g.direction === 'RL') continue;
    const row = g.nodes as RowNode[];
    for (let i = 0; i + 1 < row.length; i++) {
      if (Math.floor(i / perRow) !== Math.floor((i + 1) / perRow)) continue;
      const w = widest.get(row[i]!)?.get(row[i + 1]!) ?? 0;
      if (w > 0) row[i]!.gapAfter = w + 2 * tagEndClear();
    }
  }
}

/**
 * The widest tag on the relations between each two elements, either way, by both elements:
 * each tag as wide as it is drawn on a line across a gap (`narrow` where every text wraps). One
 * pass over the relations, so the rule stays linear in the diagram's size.
 */
function widestByPair(
  setup: LabelSetup,
  nodes: readonly RowNode[]
): Map<RowNode, Map<RowNode, number>> {
  const first = firstByAlias(nodes);
  const out = new Map<RowNode, Map<RowNode, number>>();
  const note = (p: RowNode, q: RowNode, w: number): void => {
    let row = out.get(p);
    if (!row) out.set(p, (row = new Map<RowNode, number>()));
    row.set(q, Math.max(row.get(q) ?? 0, w));
  };
  setup.model.relations.forEach((rel, index) => {
    const a = first.get(rel.from);
    const b = first.get(rel.to);
    const w = measureLabel(setup, rel, index, M.narrow)?.lw ?? 0;
    if (!a || !b || w === 0) return;
    note(a, b, w);
    note(b, a, w);
  });
  return out;
}

/** The element each alias names: the first in the model with it (v12 `getC4Shape`). */
function firstByAlias(nodes: readonly RowNode[]): Map<string, RowNode> {
  const out = new Map<string, RowNode>();
  for (const n of nodes) if (!out.has(n.element.alias)) out.set(n.element.alias, n);
  return out;
}
