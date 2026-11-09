// cspell:words preorder
/**
 * The treeView custom layout (spec #518 T3, `layoutKind: 'custom'`, D481; no core `tree`
 * engine): `TreeViewModel` in, `TreeViewLayout` out. It follows v12's `renderer.ts:52-216` with
 * the drawing taken out, in v12's steps: the rows, the connectors, the description column, the
 * highlight boxes; then the bounds. Every label and description is measured through the
 * injected measurer, in `fontFamily` at `treeViewLabelFontSize` (pitfall 16): directories bold,
 * descriptions italic. Lengths come from the `treeView` config, the measurer and the metrics
 * table (pitfall 13).
 *
 * D482: v12 drew a connector into the root row too, from `-rowIndent` to 0, wholly outside its
 * viewBox; it is dropped. D224: the bounds are v12's viewBox, grown wherever something drawn
 * reaches past it (v12 cut its right edge by `lineThickness / 2`).
 *
 * The walk is iterative and each text is measured once, so a deep tree cannot overflow the
 * stack and the layout is linear in the rows and the text.
 */
import type { RenderContext } from '@mermaid-js/core';
import { Style, type FontKey, type StyleBits } from '@mermaid-js/core/text';
import { treeViewLayoutConfig, type TreeViewLayoutConfig } from '../config.ts';
import { resolveIcon } from '../icons.ts';
import { highlighted, type TreeViewModel, type TreeViewNode } from '../model.ts';
import { lineBox, rowExtents } from './extent.ts';
import { BOLD_WEIGHT, NORMAL_WEIGHT, TREEVIEW_METRICS as M } from './metrics.ts';
import type { Rect, TreeViewLayout, TreeViewLine, TreeViewRow, TreeViewText } from './types.ts';

/**
 * What the layout reads from the render context: `warn` is told of a `treeView` option that
 * falls back (`TREEVIEW_CONFIG_INVALID`).
 */
export type TreeViewLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn'>>;

/** v12's virtual root row (`db.ts`: name `/`, a directory). */
const ROOT = { name: '/', directory: true } as const;

/** What every step of one layout reads. */
interface Frame {
  readonly config: TreeViewLayoutConfig;
  /** One line of `text` in `font` and `style`, at (0, 0) until placed. */
  readonly measure: (text: string, font: FontKey, style: StyleBits) => TreeViewText;
  /** The label font (normal weight) and the directory font (bold). */
  readonly font: FontKey;
  readonly bold: FontKey;
}

/** The rows in preorder, and each row's parent row (-1 for the root row). */
interface Placed {
  readonly rows: TreeViewRow[];
  readonly parents: readonly number[];
}

/** Lays out a treeView diagram in px. */
export function layoutTreeView(model: TreeViewModel, ctx: TreeViewLayoutContext): TreeViewLayout {
  const frame = frameOf(ctx);
  const { rows, parents } = placeRows(model, frame);
  const lines = connect(rows, parents, frame.config);
  let width = 0;
  for (const r of rows) width = Math.max(width, r.box.x + r.box.width);
  width = addDescriptions(rows, frame, width);
  width = addHighlights(rows, width);
  const last = rows[rows.length - 1]!.box;
  const height = last.y + last.height;
  const { lineThickness } = frame.config;
  return {
    rows,
    lines,
    lineThickness,
    width,
    height,
    bounds: boundsOf(rows, lines, lineThickness, width, height),
  };
}

function frameOf(ctx: TreeViewLayoutContext): Frame {
  const font = labelFont(ctx);
  const { ascent, descent } = ctx.measurer.metrics(font);
  const lineHeight = ascent + descent;
  // v12 measured with `getBBox`, which is 0 × 0 for an empty text.
  const measure = (text: string, f: FontKey, style: StyleBits): TreeViewText => ({
    text,
    font: f,
    style,
    x: 0,
    y: 0,
    width: text === '' ? 0 : ctx.measurer.width(text, f, style),
    height: text === '' ? 0 : lineHeight,
  });
  return {
    config: treeViewLayoutConfig(ctx.config.treeView, ctx.warn),
    measure,
    font,
    bold: { ...font, weight: BOLD_WEIGHT },
  };
}

/**
 * The rows, stacked from y = 0 in preorder from the root row (v12 `positionLabel`): each at
 * `depth × (rowIndent + paddingX)`, `label + 2 × paddingY` high, its icon (if any) in the slot
 * before the label.
 */
function placeRows(model: TreeViewModel, frame: Frame): Placed {
  const { config } = frame;
  const { rowIndent, paddingX, paddingY } = config;
  const rows: TreeViewRow[] = [];
  const parents: number[] = [];
  // Preorder without recursion: each entry is a node still to place and its parent's row.
  const todo: [TreeViewNode | undefined, number][] = [[undefined, -1]];
  let top = 0;
  while (todo.length > 0) {
    const [node, parent] = todo.pop()!;
    const { name, directory } = node ?? ROOT;
    const depth = parent < 0 ? 0 : rows[parent]!.depth + 1;
    const indent = depth * (rowIndent + paddingX);
    // v12 resolved the root row's icon too: a folder under showIcons.
    const icon = resolveIcon(node ?? ROOT, config);
    const slot = icon === undefined ? 0 : M.icon + M.iconGap;
    const label = directory
      ? frame.measure(name, frame.bold, Style.Bold)
      : frame.measure(name, frame.font, 0);
    const height = label.height + 2 * paddingY;
    const index = rows.length;
    rows.push({
      ...(node ? { node } : {}),
      depth,
      text: name,
      directory,
      box: { x: indent, y: top, width: label.width + 2 * paddingX + slot, height },
      label: { ...label, x: indent + paddingX + slot, y: top + height / 2 },
      ...(icon === undefined
        ? {}
        : {
            icon: {
              name: icon,
              box: { x: indent + paddingX, y: top + paddingY, width: M.icon, height: M.icon },
            },
          }),
    });
    parents.push(parent);
    top += height;
    const children = node ? node.children : model.roots;
    for (let i = children.length - 1; i >= 0; i--) todo.push([children[i]!, index]);
  }
  return { rows, parents };
}

/**
 * The connectors in v12's drawing order (`drawTree`'s recursion): a row's branch as it is
 * placed, from its parent's stem at `indent - rowIndent` to its indent at its centre (none into
 * the root row, D482); a parent's stem once its subtree is done, from its row's bottom to its
 * last child's centre plus half the line.
 */
function connect(
  rows: readonly TreeViewRow[],
  parents: readonly number[],
  config: TreeViewLayoutConfig
): TreeViewLine[] {
  const { rowIndent, paddingX, lineThickness } = config;
  const lastChild = new Map<number, number>();
  parents.forEach((p, i) => {
    if (p >= 0) lastChild.set(p, i);
  });
  const lines: TreeViewLine[] = [];
  const stem = (p: number): void => {
    const last = lastChild.get(p);
    if (last === undefined) return;
    const parent = rows[p]!.box;
    const child = rows[last]!.box;
    const x = parent.x + paddingX;
    const y2 = child.y + child.height / 2 + lineThickness / 2;
    lines.push({ kind: 'stem', row: p, x1: x, y1: parent.y + parent.height, x2: x, y2 });
  };
  // The open rows: the path from the root to the row last placed.
  const open: number[] = [];
  rows.forEach((r, i) => {
    while (open.length > 0 && open[open.length - 1] !== parents[i]) stem(open.pop()!);
    open.push(i);
    if (i === 0) return;
    const y = r.box.y + r.box.height / 2;
    lines.push({ kind: 'branch', row: i, x1: r.box.x - rowIndent, y1: y, x2: r.box.x, y2: y });
  });
  while (open.length > 0) stem(open.pop()!);
  return lines;
}

/**
 * The description column (v12's phase 2): `descriptionGap` past every label's right edge, the
 * root row's included; each description italic at its row's centre. Returns the width, grown
 * to each description's end plus `paddingX`.
 */
function addDescriptions(rows: TreeViewRow[], frame: Frame, width: number): number {
  if (!rows.some((r) => r.node?.description !== undefined)) return width;
  let right = -Infinity;
  for (const r of rows) right = Math.max(right, r.label.x + r.label.width);
  const x = right + M.descriptionGap;
  let out = width;
  rows.forEach((r, i) => {
    const text = r.node?.description;
    if (text === undefined) return;
    const d = frame.measure(text, frame.font, Style.Italic);
    rows[i] = { ...r, description: { ...d, x, y: r.label.y } };
    out = Math.max(out, x + d.width + frame.config.paddingX);
  });
  return out;
}

/**
 * The highlight boxes (v12's phase 3), in preorder: from the row's indent (v12's code; the spec
 * says the label's x) to `highlightOverhang` past the width so far, which then covers the box
 * plus `highlightSlack`, so each later box is 10 px wider than the one before (v12, GAPS T3).
 * Returns the width.
 */
function addHighlights(rows: TreeViewRow[], width: number): number {
  let out = width;
  rows.forEach((r, i) => {
    if (!highlighted(r.node)) return;
    const w = out - r.box.x + M.highlightOverhang;
    const box = {
      x: r.box.x,
      y: r.box.y + M.highlightInset,
      width: w,
      height: Math.max(0, r.box.height - 2 * M.highlightInset),
    };
    rows[i] = { ...r, highlight: { box, radius: M.highlightRadius } };
    out = Math.max(out, box.x + w + M.highlightSlack);
  });
  return out;
}

/** v12's viewBox, grown to cover everything drawn (D224). */
function boundsOf(
  rows: readonly TreeViewRow[],
  lines: readonly TreeViewLine[],
  thickness: number,
  width: number,
  height: number
): Rect {
  // `0 -` keeps a 0 thickness at 0, not -0.
  let x0 = 0 - thickness / 2;
  let y0 = 0;
  let x1 = x0 + width;
  let y1 = height;
  const add = (r: Rect): void => {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  };
  for (const r of rows) for (const e of rowExtents(r)) add(e);
  for (const l of lines) add(lineBox(l, thickness));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The label font: `fontFamily` at `treeViewLabelFontSize`, normal weight; the one place the
 * label size is read (pitfall 16). The theme reads a `length` in px: v12's `16px` and a bare
 * number are px, and a value in other units (`1em`, `12pt`) is not a length, so the theme keeps
 * its own (core's `length` kind, as every diagram's sizes; GAPS T4).
 */
function labelFont(ctx: TreeViewLayoutContext): FontKey {
  return {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('treeViewLabelFontSize'),
    weight: NORMAL_WEIGHT,
  };
}
