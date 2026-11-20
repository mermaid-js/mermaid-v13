/**
 * The room relation tags take between two row neighbours (D679, amending D454): the gap between
 * two shapes side by side in a row is at least what the widest tag on the lines between them
 * needs to sit on its line, clear of the arrowhead and the shape at each end. The grid then
 * places the row with that gap (`GridNode.gapAfter`). Only row neighbours in one group are
 * widened: shapes in different boundaries keep the gaps the boundaries give them.
 */
import type { C4Element } from '../model.ts';
import type { GridGroup, GridNode } from './grid.ts';
import { measureLabel, stepFor, tagEndClear, tagStepOf, type LabelSetup } from './labels.ts';
import { C4_METRICS as M } from './metrics.ts';
import { stackOf } from './pairs.ts';
import { portBox } from './shapes.ts';
import type { C4ShapeId } from './types.ts';

/** An element as the grid places it. */
export interface RowNode extends GridNode {
  readonly element: Pick<C4Element, 'alias'>;
  readonly form: C4ShapeId;
}

/**
 * Sets `gapAfter` on every element that labelled relations join to the next element of its
 * group. The lines between them stand as {@link stackOf} says for the room the two shapes share
 * across (half the shorter port box, less `portInset`, as `pairRoom` measures it once they are
 * placed): in one column the gap holds the widest tag; staggered it holds the widest tag at each
 * end side by side, `tagClear` apart; each with `tagEndClear` at both ends. The grid reads a gap
 * only between two members of one row, so one set after a row's last member, or in a group laid
 * out in columns (LR, RL), changes nothing.
 */
export function widenForLabels(
  groups: readonly GridGroup[],
  nodes: readonly RowNode[],
  setup: LabelSetup
): void {
  const between = tagsByPair(setup, nodes);
  for (const g of groups) {
    const row = g.nodes as RowNode[];
    for (let i = 0; i + 1 < row.length; i++) {
      const tags = between.get(row[i]!)?.get(row[i + 1]!);
      if (tags) row[i]!.gapAfter = gapFor(tags, sharedRoom(row[i]!, row[i + 1]!));
    }
  }
}

/** The room the lines between two row neighbours spread over, either side of their middle. */
function sharedRoom(p: RowNode, q: RowNode): number {
  const side = (n: RowNode): number =>
    portBox({ x: 0, y: 0, width: n.w, height: n.h, form: n.form }).height;
  return Math.max(0, Math.min(side(p), side(q)) / 2 - M.portInset);
}

/** A relation's tag: its width (0 for none) and the step it needs from the next line. */
interface Tag {
  readonly w: number;
  readonly step: number;
}

/**
 * The gap the tags (in the order their lines are spread) need, their lines spread over `room`;
 * 0 when none is labelled.
 */
function gapFor(tags: readonly Tag[], room: number): number {
  const widest = (parity: number): number =>
    Math.max(0, ...tags.filter((_, i) => i % 2 === parity).map((t) => t.w));
  const both = Math.max(widest(0), widest(1));
  if (both === 0) return 0;
  const step = Math.max(...tags.map((t) => t.step));
  const stagger = stackOf(tags.length, room, step) === 'stagger';
  const across = stagger ? widest(0) + widest(1) + M.tagClear : both;
  return across + 2 * tagEndClear();
}

/**
 * The tags on the relations between each two elements, either way, in statement order, by both
 * elements: each as wide as it is drawn on a line across a gap (`narrow` where every text
 * wraps), 0 without a label, and the step it needs. One pass over the relations, so the rule stays linear in the
 * diagram's size.
 */
function tagsByPair(
  setup: LabelSetup,
  nodes: readonly RowNode[]
): Map<RowNode, Map<RowNode, Tag[]>> {
  const first = firstByAlias(nodes);
  const out = new Map<RowNode, Map<RowNode, Tag[]>>();
  const mapOf = (p: RowNode): Map<RowNode, Tag[]> => {
    let map = out.get(p);
    if (!map) out.set(p, (map = new Map<RowNode, Tag[]>()));
    return map;
  };
  // One list for the pair, reached from either element.
  const listOf = (p: RowNode, q: RowNode): Tag[] => {
    const known = out.get(p)?.get(q);
    if (known) return known;
    const list: Tag[] = [];
    mapOf(p).set(q, list);
    mapOf(q).set(p, list);
    return list;
  };
  const base = tagStepOf(setup);
  setup.model.relations.forEach((rel, index) => {
    const a = first.get(rel.from);
    const b = first.get(rel.to);
    if (!a || !b || a === b) return;
    const measured = measureLabel(setup, rel, index, M.narrow);
    listOf(a, b).push({ w: measured?.lw ?? 0, step: stepFor(base, measured) });
  });
  return out;
}

/** The element each alias names: the first in the model with it (v12 `getC4Shape`). */
function firstByAlias(nodes: readonly RowNode[]): Map<string, RowNode> {
  const out = new Map<string, RowNode>();
  for (const n of nodes) if (!out.has(n.element.alias)) out.set(n.element.alias, n);
  return out;
}
