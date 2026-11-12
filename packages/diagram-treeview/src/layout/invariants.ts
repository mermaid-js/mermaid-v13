// cspell:words preorder
/**
 * The treeView layout's invariants (R-LAYOUT-3, spec #518 T3): what every `TreeViewLayout` of a
 * model must satisfy, whatever the config or the measurer. Returns one message per broken rule;
 * none for a sound layout. The checker works out what it expects from the model, the raw
 * `treeView` section and the metrics table on its own: it shares neither the layout's config
 * reading nor its extents, so a bug in either fails it. Checks:
 * - no NaN anywhere, and no infinite length;
 * - the rows are the root row `/` and then the model's nodes in preorder (walked from
 *   `roots`), each at the node's depth plus 1;
 * - the rows stack from y = 0 without gaps or overlaps, each its label plus `2 × paddingY` high;
 * - a row's indent is `depth × (rowIndent + paddingX)`, so a child's is its parent's plus
 *   `rowIndent + paddingX`; its label is `paddingX` in (past the icon slot with an icon), at
 *   its centre; its icon `paddingX` in and `paddingY` down;
 * - one branch into every row but the root (D482), at its centre, from its parent's stem; one
 *   stem down each parent, from its row's bottom to its last child's centre plus half the line;
 * - descriptions where the model has them, in one column `descriptionGap` past the widest
 *   label, at their row's centre;
 * - a highlight box exactly on the `highlight` rows, covering the row's text;
 * - everything drawn (labels, icons, descriptions, highlight boxes with their stroke, lines
 *   with their thickness) lies inside `bounds`.
 */
import { treeViewOptions } from '../config.ts';
import { highlighted, type TreeViewModel, type TreeViewNode } from '../model.ts';
import { TREEVIEW_METRICS as M } from './metrics.ts';
import type { Rect, TreeViewLayout, TreeViewLine, TreeViewRow, TreeViewText } from './types.ts';
import { numbers, rectInside as inside } from '@mermaid-js/shared/layout/invariants';

const EPS = 1e-6;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(b));
const showRect = (r: Rect): string => `(${r.x}, ${r.y}, ${r.width} × ${r.height})`;
const showLine = (l: Omit<TreeViewLine, 'kind' | 'row'>): string =>
  `(${l.x1}, ${l.y1})–(${l.x2}, ${l.y2})`;
const rowName = (r: TreeViewRow | undefined): string => r?.node?.astId ?? (r ? 'the root' : 'none');

/** The model's nodes in preorder, each with its parent (undefined at the top), from `roots`. */
function preorder(model: TreeViewModel): [TreeViewNode, TreeViewNode | undefined][] {
  const out: [TreeViewNode, TreeViewNode | undefined][] = [];
  const stack: [TreeViewNode, TreeViewNode | undefined][] = model.roots
    .map((n): [TreeViewNode, undefined] => [n, undefined])
    .reverse();
  while (stack.length > 0) {
    const [node, parent] = stack.pop()!;
    out.push([node, parent]);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push([node.children[i]!, node]);
  }
  return out;
}

/**
 * The lengths the checker expects: a finite number of 0 or more as given (a numeric string as
 * its number, #577), else the default.
 */
function lengthsOf(section: Readonly<Record<string, unknown>>) {
  const read = (
    key: 'rowIndent' | 'paddingX' | 'paddingY' | 'lineThickness',
    d: number
  ): number => {
    const given = section[key];
    const v = typeof given === 'string' && given.trim() !== '' ? Number(given) : given;
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d;
  };
  const d = treeViewOptions(undefined);
  return {
    rowIndent: read('rowIndent', d.rowIndent),
    paddingX: read('paddingX', d.paddingX),
    paddingY: read('paddingY', d.paddingY),
    lineThickness: read('lineThickness', d.lineThickness),
  };
}

/** A text's extent: `width` from its `x`, `height` centred on its `y`. */
const textRect = (t: TreeViewText): Rect => ({
  x: t.x,
  y: t.y - t.height / 2,
  width: t.width,
  height: t.height,
});

/** A line's extent with its stroke: `thickness` across it, butt caps. */
function lineRect(l: TreeViewLine, thickness: number): Rect {
  const across = thickness / 2;
  if (l.kind === 'branch')
    return { x: l.x1, y: l.y1 - across, width: l.x2 - l.x1, height: thickness };
  return { x: l.x1 - across, y: l.y1, width: thickness, height: l.y2 - l.y1 };
}

/** What a row draws, each named. */
function drawnBy(r: TreeViewRow): [string, Rect][] {
  const out: [string, Rect][] = [['label', textRect(r.label)]];
  if (r.icon) out.push(['icon', r.icon.box]);
  if (r.description) out.push(['description', textRect(r.description)]);
  if (r.highlight) {
    const s = M.highlightStroke / 2;
    const b = r.highlight.box;
    out.push([
      'highlight',
      { x: b.x - s, y: b.y - s, width: b.width + 2 * s, height: b.height + 2 * s },
    ]);
  }
  return out;
}

/**
 * The broken invariants of `layout` as a layout of `model` under the `treeView` config
 * `section` (the one it was laid out with).
 */
export function treeViewLayoutViolations(
  model: TreeViewModel,
  layout: TreeViewLayout,
  section: Readonly<Record<string, unknown>> = {}
): string[] {
  const out: string[] = [];
  for (const [path, n] of numbers(layout, 'layout', 'node'))
    if (!Number.isFinite(n)) out.push(`${path} is ${n}`);
  if (out.length > 0) return out;

  const { rowIndent, paddingX, paddingY, lineThickness } = lengthsOf(section);
  const step = rowIndent + paddingX;
  const { rows } = layout;
  if (!near(layout.lineThickness, lineThickness))
    out.push(`the lines are ${layout.lineThickness} thick, not ${lineThickness}`);

  // The rows: the root, then the preorder.
  const order = preorder(model);
  const rowOf = new Map<TreeViewNode, number>();
  if (rows[0]?.node !== undefined || rows[0]?.text !== '/') out.push('row 0 is not the root');
  if (rows.length !== order.length + 1)
    out.push(`${rows.length} rows for ${order.length} nodes and the root`);
  order.forEach(([node], i) => {
    const r = rows[i + 1];
    if (r?.node !== node) out.push(`row ${i + 1} is ${rowName(r)}, not ${node.astId}`);
    else rowOf.set(node, i + 1);
  });
  if (out.length > 0) return out;

  // Stacking, indents, labels and icons.
  const centre = (r: TreeViewRow): number => r.box.y + r.box.height / 2;
  let y = 0;
  rows.forEach((r, i) => {
    const depth = r.node ? r.node.depth + 1 : 0;
    if (r.depth !== depth) out.push(`row ${i} is at depth ${r.depth}, not ${depth}`);
    if (!near(r.box.y, y)) out.push(`row ${i} starts at ${r.box.y}, not ${y}`);
    if (!near(r.box.height, r.label.height + 2 * paddingY))
      out.push(`row ${i} is ${r.box.height} high, not its label + ${2 * paddingY}`);
    y = r.box.y + r.box.height;
    if (!near(r.box.x, depth * step)) out.push(`row ${i} is at x ${r.box.x}, not ${depth * step}`);
    const slot = r.icon ? M.icon + M.iconGap : 0;
    const labelX = r.box.x + paddingX + slot;
    if (!near(r.label.x, labelX) || !near(r.label.y, centre(r)))
      out.push(
        `row ${i}'s label is at (${r.label.x}, ${r.label.y}), not (${labelX}, ${centre(r)})`
      );
    if (!near(r.box.width, r.label.width + 2 * paddingX + slot))
      out.push(`row ${i} is ${r.box.width} wide, not its label + paddings + icon slot`);
    const icon = r.icon?.box;
    if (
      icon &&
      !(
        near(icon.x, r.box.x + paddingX) &&
        near(icon.y, r.box.y + paddingY) &&
        icon.width === M.icon &&
        icon.height === M.icon
      )
    )
      out.push(`row ${i}'s icon ${showRect(icon)} is not ${M.icon} square at paddingX, paddingY`);
  });
  for (const [node, parent] of order) {
    const r = rows[rowOf.get(node)!]!;
    const p = rows[parent ? rowOf.get(parent)! : 0]!;
    if (!near(r.box.x, p.box.x + step))
      out.push(`row ${rowOf.get(node)} is not ${step} in from its parent's`);
  }

  // Connectors, grouped by row once.
  const branches = new Map<number, TreeViewLine[]>();
  const stems = new Map<number, TreeViewLine[]>();
  for (const l of layout.lines) {
    const by = l.kind === 'branch' ? branches : stems;
    let list = by.get(l.row);
    if (!list) by.set(l.row, (list = []));
    list.push(l);
  }
  const children = new Map<number, readonly TreeViewNode[]>([[0, model.roots]]);
  for (const [node] of order) children.set(rowOf.get(node)!, node.children);
  const check = (
    kind: string,
    i: number,
    found: TreeViewLine[],
    want?: Omit<TreeViewLine, 'kind' | 'row'>
  ): void => {
    if (!want) {
      if (found.length > 0)
        out.push(`row ${i} has ${found.length} ${kind}(s) and should have none`);
    } else if (found.length !== 1) out.push(`row ${i} has ${found.length} ${kind}s, not 1`);
    else if (!same(found[0]!, want))
      out.push(`the ${kind} of row ${i} is ${showLine(found[0]!)}, not ${showLine(want)}`);
  };
  rows.forEach((r, i) => {
    const c = centre(r);
    // D482: none into the root row.
    check(
      'branch',
      i,
      branches.get(i) ?? [],
      i === 0 ? undefined : { x1: r.box.x - rowIndent, y1: c, x2: r.box.x, y2: c }
    );
    const kids = children.get(i) ?? [];
    let want: Omit<TreeViewLine, 'kind' | 'row'> | undefined;
    if (kids.length > 0) {
      const last = rows[rowOf.get(kids[kids.length - 1]!)!]!;
      const x = r.box.x + paddingX;
      want = { x1: x, y1: r.box.y + r.box.height, x2: x, y2: centre(last) + lineThickness / 2 };
    }
    check('stem', i, stems.get(i) ?? [], want);
  });

  // The description column.
  let widest = -Infinity;
  for (const r of rows) widest = Math.max(widest, r.label.x + r.label.width);
  const column = widest + M.descriptionGap;
  rows.forEach((r, i) => {
    const d = r.description;
    if ((r.node?.description !== undefined) !== Boolean(d))
      out.push(`row ${i} ${d ? 'has a description the model has not' : 'lost its description'}`);
    if (!d) return;
    if (!near(d.x, column))
      out.push(`the description of row ${i} is at x ${d.x}, the column at ${column}`);
    if (!near(d.y, centre(r))) out.push(`the description of row ${i} is off its centre`);
    if (d.text !== r.node?.description) out.push(`the description of row ${i} is not the model's`);
  });

  // Highlight boxes.
  rows.forEach((r, i) => {
    const want = highlighted(r.node);
    if (want !== Boolean(r.highlight))
      out.push(
        `row ${i} is ${want ? 'highlighted and has no box' : 'not highlighted and has a box'}`
      );
    if (!r.highlight) return;
    const box = r.highlight.box;
    for (const t of [r.label, r.description])
      if (t && (t.x < box.x - EPS || t.x + t.width > box.x + box.width + EPS))
        out.push(`row ${i}'s highlight ${showRect(box)} does not cover ${JSON.stringify(t.text)}`);
  });

  // Everything inside the bounds.
  const bounds = showRect(layout.bounds);
  rows.forEach((r, i) => {
    for (const [what, e] of drawnBy(r))
      if (!inside(e, layout.bounds))
        out.push(`row ${i}'s ${what} ${showRect(e)} is outside the bounds ${bounds}`);
  });
  for (const l of layout.lines) {
    const e = lineRect(l, lineThickness);
    if (!inside(e, layout.bounds))
      out.push(`the ${l.kind} of row ${l.row} ${showRect(e)} is outside the bounds ${bounds}`);
  }
  return out;
}

function same(l: TreeViewLine, want: Omit<TreeViewLine, 'kind' | 'row'>): boolean {
  return near(l.x1, want.x1) && near(l.y1, want.y1) && near(l.x2, want.x2) && near(l.y2, want.y2);
}
