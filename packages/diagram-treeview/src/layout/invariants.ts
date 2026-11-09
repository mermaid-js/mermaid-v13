// cspell:words preorder
/**
 * The treeView layout's invariants (R-LAYOUT-3, spec #518 T3): what every `TreeViewLayout` of a
 * model must satisfy, whatever the config or the measurer. Returns one message per broken rule;
 * none for a sound layout. Checks:
 * - no NaN anywhere, and no infinite length;
 * - the rows are the root row `/` and then the model's nodes in preorder (walked from
 *   `roots`), each at its parent's depth plus 1;
 * - the rows stack from y = 0 without gaps or overlaps, none of negative height;
 * - a child's indent is its parent's plus `rowIndent + paddingX`, the root's 0; its label lies
 *   within its row;
 * - one branch into every row but the root (D482), at its centre, from its parent's stem; one
 *   stem down each parent, from its row's bottom to its last child's centre plus half the line;
 * - descriptions where the model has them, in one column, `descriptionGap` clear of every
 *   label, at their row's centre;
 * - a highlight box exactly on the `highlight` rows, covering the row's text;
 * - everything drawn lies inside `bounds`.
 */
import { treeViewLayoutConfig } from '../config.ts';
import type { TreeViewModel, TreeViewNode } from '../model.ts';
import { lineBox, rowExtents, textBox } from './extent.ts';
import { TREEVIEW_METRICS as M } from './metrics.ts';
import type { Rect, TreeViewLayout, TreeViewLine, TreeViewRow } from './types.ts';

const EPS = 1e-6;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(b));
const show = (r: Rect): string => `(${r.x}, ${r.y}, ${r.width} × ${r.height})`;
const name = (r: TreeViewRow | undefined): string => r?.node?.astId ?? (r ? 'the root' : 'none');

function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.width <= outer.x + outer.width + EPS &&
    inner.y + inner.height <= outer.y + outer.height + EPS
  );
}

/** Every number in the layout, with a path to name it. */
function* numbers(value: unknown, path: string): Generator<[string, number]> {
  if (typeof value === 'number') yield [path, value];
  else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* numbers(value[i], `${path}[${i}]`);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== 'node') yield* numbers(v, `${path}.${k}`);
  }
}

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

const line = (l: TreeViewLine): string => `(${l.x1}, ${l.y1})–(${l.x2}, ${l.y2})`;

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
  for (const [path, n] of numbers(layout, 'layout'))
    if (!Number.isFinite(n)) out.push(`${path} is ${n}`);
  if (out.length > 0) return out;

  const { rowIndent, paddingX } = treeViewLayoutConfig(section);
  const thickness = layout.lineThickness;
  const { rows } = layout;

  // The rows: the root, then the preorder.
  const order = preorder(model);
  const rowOf = new Map<TreeViewNode, number>();
  if (rows[0]?.node !== undefined || rows[0]?.text !== '/') out.push('row 0 is not the root');
  if (rows.length !== order.length + 1)
    out.push(`${rows.length} rows for ${order.length} nodes and the root`);
  order.forEach(([node], i) => {
    const r = rows[i + 1];
    if (r?.node !== node) out.push(`row ${i + 1} is ${name(r)}, not ${node.astId}`);
    else rowOf.set(node, i + 1);
  });
  if (out.length > 0) return out;

  // Stacking and indents.
  let y = 0;
  rows.forEach((r, i) => {
    if (!near(r.box.y, y)) out.push(`row ${i} starts at ${r.box.y}, not ${y}`);
    if (r.box.height < 0) out.push(`row ${i} is ${r.box.height} high`);
    y = r.box.y + r.box.height;
    const label = textBox(r.label);
    if (label.x < r.box.x - EPS || label.x + label.width > r.box.x + r.box.width + EPS)
      out.push(`row ${i}'s label ${show(label)} is outside its row ${show(r.box)}`);
  });
  if (rows[0]!.box.x !== 0 || rows[0]!.depth !== 0) out.push('the root row is not at x 0, depth 0');
  for (const [node, parent] of order) {
    const i = rowOf.get(node)!;
    const p = rows[parent ? rowOf.get(parent)! : 0]!;
    const r = rows[i]!;
    const x = p.box.x + rowIndent + paddingX;
    if (!near(r.box.x, x)) out.push(`row ${i} is at x ${r.box.x}, not ${x}`);
    if (r.depth !== p.depth + 1) out.push(`row ${i} is at depth ${r.depth}, not ${p.depth + 1}`);
  }

  // Connectors.
  const centre = (r: TreeViewRow): number => r.box.y + r.box.height / 2;
  const children = new Map<number, TreeViewNode[]>([[0, [...model.roots]]]);
  for (const [node] of order) children.set(rowOf.get(node)!, [...node.children]);
  rows.forEach((r, i) => {
    const branches = layout.lines.filter((l) => l.kind === 'branch' && l.row === i);
    if (i === 0) {
      if (branches.length > 0) out.push(`row 0 has ${branches.length} branch(es) (D482)`);
    } else {
      const c = centre(r);
      const want = { x1: r.box.x - rowIndent, y1: c, x2: r.box.x, y2: c };
      if (branches.length !== 1) out.push(`row ${i} has ${branches.length} branches, not 1`);
      else if (!same(branches[0]!, want))
        out.push(
          `the branch into row ${i} is ${line(branches[0]!)}, not ${line({ ...want, kind: 'branch', row: i })}`
        );
    }
    const stems = layout.lines.filter((l) => l.kind === 'stem' && l.row === i);
    const kids = children.get(i) ?? [];
    if (kids.length === 0) {
      if (stems.length > 0) out.push(`row ${i} has no children and ${stems.length} stem(s)`);
      return;
    }
    const last = rows[rowOf.get(kids[kids.length - 1]!)!]!;
    const x = r.box.x + paddingX;
    const want = { x1: x, y1: r.box.y + r.box.height, x2: x, y2: centre(last) + thickness / 2 };
    if (stems.length !== 1) out.push(`row ${i} has ${stems.length} stems, not 1`);
    else if (!same(stems[0]!, want))
      out.push(
        `the stem of row ${i} is ${line(stems[0]!)}, not ${line({ ...want, kind: 'stem', row: i })}`
      );
  });

  // The description column.
  const described = rows.filter((r) => r.description);
  rows.forEach((r, i) => {
    if ((r.node?.description !== undefined) !== Boolean(r.description))
      out.push(
        `row ${i} ${r.description ? 'has a description the model has not' : 'lost its description'}`
      );
  });
  if (described.length > 0) {
    const column = described[0]!.description!.x;
    rows.forEach((r, i) => {
      const d = r.description;
      if (d && !near(d.x, column))
        out.push(`the description of row ${i} is at x ${d.x}, the column at ${column}`);
      if (d && !near(d.y, centre(r))) out.push(`the description of row ${i} is off its centre`);
      if (r.label.x + r.label.width + M.descriptionGap > column + EPS)
        out.push(`the description column ${column} is not clear of row ${i}'s label`);
    });
  }

  // Highlight boxes.
  rows.forEach((r, i) => {
    const want = r.node?.cssClass === 'highlight';
    if (want !== Boolean(r.highlight))
      out.push(
        `row ${i} is ${want ? 'highlighted and has no box' : 'not highlighted and has a box'}`
      );
    if (!r.highlight) return;
    const box = r.highlight.box;
    for (const t of [r.label, r.description])
      if (t && (t.x < box.x - EPS || t.x + t.width > box.x + box.width + EPS))
        out.push(`row ${i}'s highlight ${show(box)} does not cover ${JSON.stringify(t.text)}`);
  });

  // Everything inside the bounds.
  rows.forEach((r, i) => {
    const what = ['label', 'icon', 'description', 'highlight'].filter(
      (k) => k === 'label' || r[k as keyof TreeViewRow] !== undefined
    );
    rowExtents(r).forEach((e, k) => {
      if (!inside(e, layout.bounds))
        out.push(`row ${i}'s ${what[k]} ${show(e)} is outside the bounds ${show(layout.bounds)}`);
    });
  });
  layout.lines.forEach((l) => {
    const e = lineBox(l, thickness);
    if (!inside(e, layout.bounds))
      out.push(
        `the ${l.kind} of row ${l.row} ${show(e)} is outside the bounds ${show(layout.bounds)}`
      );
  });
  return out;
}

function same(l: TreeViewLine, want: Omit<TreeViewLine, 'kind' | 'row'>): boolean {
  return near(l.x1, want.x1) && near(l.y1, want.y1) && near(l.x2, want.x2) && near(l.y2, want.y2);
}
