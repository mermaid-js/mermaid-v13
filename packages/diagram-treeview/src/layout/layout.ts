// cspell:words preorder
/**
 * The treeView custom layout (spec #518 T3, `layoutKind: 'custom'`, D481; no core `tree`
 * engine): `TreeViewModel` in, `TreeViewLayout` out. It follows v12's `renderer.ts:52-216` with
 * the drawing taken out. Every label and description is measured first through the injected
 * measurer, in `fontFamily` at the label size (pitfall 16): directories bold, descriptions
 * italic. Then the rows are placed in preorder from v12's virtual root `/` (D482), each indented
 * by its depth, and the connectors, the description column and the highlight boxes as v12 put
 * them. Lengths come from the `treeView` config, the measurer and the metrics table (pitfall 13).
 *
 * D482: v12 drew a connector into the root row too, from `-rowIndent` to 0, wholly outside its
 * viewBox; it is dropped. D224: the bounds are v12's viewBox, grown wherever something drawn
 * reaches past it (v12 cut its right edge by `lineThickness / 2`).
 *
 * The walk is iterative and each label is measured once, so a deep tree cannot overflow the
 * stack and the layout is linear in the rows and the text.
 */
import type { RenderContext } from '@mermaid-js/core';
import { Style, type FontKey } from '@mermaid-js/core/text';
import { treeViewLayoutConfig } from '../config.ts';
import { resolveIcon } from '../icons.ts';
import type { TreeViewModel, TreeViewNode } from '../model.ts';
import { BOLD_WEIGHT, NORMAL_WEIGHT, TREEVIEW_METRICS as M } from './metrics.ts';
import type { Rect, TreeViewLayout, TreeViewLine, TreeViewRow, TreeViewText } from './types.ts';
import { lineBox, rowExtents } from './extent.ts';

/** What the layout reads from the render context. */
export type TreeViewLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'>;

/** v12's virtual root row (`db.ts`: name `/`, a directory). */
const ROOT = { name: '/', directory: true } as const;

/** A row being placed, and the children still to place under it. */
interface Frame {
  readonly row: number;
  readonly children: readonly TreeViewNode[];
  next: number;
  /** The index of the last child's row, once placed. */
  last: number;
}

/** Lays out a treeView diagram in px. */
export function layoutTreeView(model: TreeViewModel, ctx: TreeViewLayoutContext): TreeViewLayout {
  const config = treeViewLayoutConfig(ctx.config.treeView);
  const { rowIndent, paddingX, paddingY, lineThickness } = config;
  const font = labelFont(ctx);
  const { ascent, descent } = ctx.measurer.metrics(font);
  const lineHeight = ascent + descent;

  const measure = (text: string, f: FontKey, style: number): TreeViewText => ({
    text,
    font: f,
    x: 0,
    y: 0,
    width: text === '' ? 0 : ctx.measurer.width(text, f, style),
    height: text === '' ? 0 : lineHeight,
  });
  const bold: FontKey = { ...font, weight: BOLD_WEIGHT };

  const rows: TreeViewRow[] = [];
  const lines: TreeViewLine[] = [];
  let totalHeight = 0;
  let totalWidth = 0;

  const place = (node: TreeViewNode | undefined, depth: number): number => {
    const { name, directory } = node ?? ROOT;
    const indent = depth * (rowIndent + paddingX);
    // v12 resolved the root row's icon too: a folder under showIcons.
    const icon = resolveIcon(node ?? ROOT, config);
    const slot = icon === undefined ? 0 : M.icon + M.iconGap;
    const measured = measure(name, directory ? bold : font, directory ? Style.Bold : 0);
    const height = measured.height + 2 * paddingY;
    const width = measured.width + 2 * paddingX + slot;
    const y = totalHeight + height / 2;
    const index = rows.length;
    rows.push({
      ...(node ? { node } : {}),
      depth,
      text: name,
      directory,
      box: { x: indent, y: totalHeight, width, height },
      label: { ...measured, x: indent + paddingX + slot, y },
      ...(icon === undefined
        ? {}
        : {
            icon: {
              name: icon,
              box: {
                x: indent + paddingX,
                y: totalHeight + paddingY,
                width: M.icon,
                height: M.icon,
              },
            },
          }),
    });
    if (node)
      lines.push({ kind: 'branch', row: index, x1: indent - rowIndent, y1: y, x2: indent, y2: y });
    totalWidth = Math.max(totalWidth, indent + width);
    totalHeight += height;
    return index;
  };

  const stack: Frame[] = [{ row: place(undefined, 0), children: model.roots, next: 0, last: -1 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const child = top.children[top.next];
    if (child) {
      top.next++;
      top.last = place(child, stack.length);
      stack.push({ row: top.last, children: child.children, next: 0, last: -1 });
      continue;
    }
    stack.pop();
    if (top.last < 0) continue;
    const parent = rows[top.row]!.box;
    const last = rows[top.last]!.box;
    const x = parent.x + paddingX;
    lines.push({
      kind: 'stem',
      row: top.row,
      x1: x,
      y1: parent.y + parent.height,
      x2: x,
      y2: last.y + last.height / 2 + lineThickness / 2,
    });
  }

  // The description column: past every label's right edge, the root row's included.
  if (model.nodes.some((n) => n.description !== undefined)) {
    let right = -Infinity;
    for (const r of rows) right = Math.max(right, r.label.x + r.label.width);
    const x = right + M.descriptionGap;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const text = r.node?.description;
      if (text === undefined) continue;
      const d = measure(text, font, Style.Italic);
      rows[i] = { ...r, description: { ...d, x, y: r.label.y } };
      totalWidth = Math.max(totalWidth, x + d.width + paddingX);
    }
  }

  // The highlight boxes, in preorder: from the row's indent (v12's code; the spec says the
  // label's x) to `highlightOverhang` past the width so far, which then covers the box plus
  // `highlightSlack`, so each later box is 10 px wider than the one before (v12, GAPS T3).
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!highlighted(r.node)) continue;
    const width = totalWidth - r.box.x + M.highlightOverhang;
    const box = {
      x: r.box.x,
      y: r.box.y + M.highlightInset,
      width,
      height: Math.max(0, r.box.height - 2 * M.highlightInset),
    };
    rows[i] = { ...r, highlight: { box, radius: M.highlightRadius } };
    totalWidth = Math.max(totalWidth, box.x + width + M.highlightSlack);
  }

  return {
    rows,
    lines,
    lineThickness,
    width: totalWidth,
    height: totalHeight,
    bounds: boundsOf(rows, lines, lineThickness, totalWidth, totalHeight),
  };
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
 * Whether a row is highlighted: v12 split the class on blanks and looked for `highlight`; the
 * grammar's class is one name, so it is that name.
 */
function highlighted(node: TreeViewNode | undefined): boolean {
  return node?.cssClass === 'highlight';
}

/**
 * The label font: `fontFamily` at the label size, normal weight. The one place the label size
 * is read: the renderer (#575) makes it the theme variable `treeViewLabelFontSize`.
 */
function labelFont(ctx: TreeViewLayoutContext): FontKey {
  return { family: ctx.theme.value('fontFamily'), size: M.labelFontSize, weight: NORMAL_WEIGHT };
}
