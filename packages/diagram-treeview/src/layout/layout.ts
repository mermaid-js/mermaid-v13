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
import { RectUnion } from '@mermaid-js/shared/layout';
import {
  decodeEntities,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
  type StyleBits,
} from '@mermaid-js/core/text';
import { readLabel } from '@mermaid-js/core/text/markdown-warning';
import { treeViewOptions, type TreeViewOptions } from '../config.ts';
import { resolveIcon } from '../icons.ts';
import { highlighted, type TreeViewModel, type TreeViewNode } from '../model.ts';
import { lineBox, rowExtents } from './extent.ts';
import { BOLD_WEIGHT, NORMAL_WEIGHT, TREEVIEW_METRICS as M } from './metrics.ts';
import type { Rect, TreeViewLayout, TreeViewLine, TreeViewRow, TreeViewText } from './types.ts';

/**
 * What the layout reads from the render context: `warn` is told of a `treeView` option that
 * falls back (`TREEVIEW_CONFIG_INVALID`) and of markdown in a plain name (`MARKDOWN_NOT_READ`,
 * once per render through `inline`).
 */
export type TreeViewLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn' | 'inline'>>;

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

/**
 * What the label rule may read in a plain name (#1368), besides markdown: a tag, a written `\n`
 * (a backslash), a line break. A plain name without them is drawn as written.
 */
const RE_READ = /[<\\\n\r]/;

/**
 * A name the label rule reads nothing in, in either mode: no tag, backslash or line break, no
 * emphasis or code mark and no list marker at its start. It is drawn as written without asking
 * the handler (and gives no warning, which needs an emphasis mark).
 */
const RE_NOTHING_READ = /^(?!\s*[-+*]\s)[^<\\\n\r*_`]*$/;

/** v12's virtual root row (`db.ts`: name `/`, a directory). */
const ROOT = { name: '/', directory: true } as const;

/** What every step of one layout reads. */
interface Frame {
  readonly config: TreeViewOptions;
  /** One line of `text` in `font` and `style`, at (0, 0) until placed. */
  readonly measure: (text: string, font: FontKey, style: StyleBits) => TreeViewText;
  /** A node's label, by the label rule (#1368), at (0, 0) until placed. */
  readonly label: (name: string, directory: boolean, markdown: boolean) => TreeViewText;
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
  // Entity codes are decoded here (D563): a name is measured and drawn as its characters.
  const measure = (written: string, f: FontKey, style: StyleBits): TreeViewText => {
    const text = decodeEntities(written);
    return {
      text,
      font: f,
      style,
      x: 0,
      y: 0,
      width: text === '' ? 0 : ctx.measurer.width(text, f, style),
      height: text === '' ? 0 : lineHeight,
    };
  };
  const bold: FontKey = { ...font, weight: BOLD_WEIGHT };
  const read = {
    config: ctx.config,
    warn: ctx.warn ?? ignoreWarning,
    ...(ctx.inline ? { inline: ctx.inline } : {}),
  };
  const label = (name: string, directory: boolean, markdown: boolean): TreeViewText => {
    const f = directory ? bold : font;
    const style = directory ? Style.Bold : 0;
    if (!markdown && RE_NOTHING_READ.test(name)) return measure(name, f, style);
    const source = readLabel(markdown ? name.slice(1, -1) : name, { markdown }, read);
    // A plain name with nothing the rule reads: as written, its blank runs kept.
    if (source.markup === 'plain' && !RE_READ.test(name)) return measure(name, f, style);
    const laid = layoutLabel(source.text, f, Infinity, ctx.measurer, { ...source, style });
    const text = decodeEntities(name);
    const run = asWritten(laid, text, style);
    if (run === undefined) return runsText(laid, f, style, lineHeight);
    // As v12 drew it: its blank runs kept, measured once.
    return run.text === text && text !== ''
      ? { text, font: f, style, x: 0, y: 0, width: run.width, height: lineHeight }
      : measure(name, f, style);
  };
  return {
    config: treeViewOptions(ctx.config.treeView, ctx.warn),
    measure,
    label,
    font,
    bold,
  };
}

/**
 * The one run of `laid` when the label rule read nothing in `text` (the name, its entities
 * decoded): one line of one run in the base style whose text is `text` with its blank runs as
 * one blank and none at its ends, as the label layout keeps it. Else undefined: a tag, a
 * markdown string or a line break changed what is drawn.
 */
function asWritten(
  laid: MeasuredLabel,
  text: string,
  style: StyleBits
): { text: string; width: number } | undefined {
  if (laid.lines.length > 1) return undefined;
  const line = laid.lines[0] ?? [];
  if (line.length > 1) return undefined;
  const run = line[0] ?? { text: '', width: 0, style };
  if (run.style !== style || run.kind === 'box') return undefined;
  return run.text === text.replace(/[ \t]+/g, ' ').trim() ? run : undefined;
}

/**
 * A label drawn as lines of runs. Its first line is as high as a plain label (`line`, the
 * font's ascent and descent), and each line after it adds the label layout's line height, so
 * the row grows by a line per line and a one-line label's row keeps a plain row's height.
 */
function runsText(
  laid: MeasuredLabel,
  font: FontKey,
  style: StyleBits,
  line: number
): TreeViewText {
  const lines = laid.lines.length;
  return {
    text: laid.lines.map((l) => l.map((r) => r.text).join('')).join('\n'),
    font,
    style,
    x: 0,
    y: 0,
    width: laid.width,
    height: lines === 0 ? 0 : line + (lines - 1) * laid.lineHeight,
    runs: laid,
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
    const label = frame.label(name, directory, node?.markdown === true);
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
  config: TreeViewOptions
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
  const box = new RectUnion();
  // `0 -` keeps a 0 thickness at 0, not -0.
  box.add({ x: 0 - thickness / 2, y: 0, width, height });
  for (const r of rows) for (const e of rowExtents(r)) box.add(e);
  for (const l of lines) box.add(lineBox(l, thickness));
  return box.rect();
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
