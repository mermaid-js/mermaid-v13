// cspell:words preorder
// Draws a laid-out treeView through the SvgWriter (spec #518 T4, DESIGN §7). The layout
// (`layoutTreeView`) placed everything in the diagram's coordinates; this file only paints it,
// in v12's order (`renderer.ts`): in `g.tree-view`, each row's `g` (the root row `/` first, then
// the nodes in preorder) followed by its connector, and each parent's stem after its subtree.
// v12's class names are kept. A row's `g` holds the highlight box (first, as v12 inserted it),
// the icon, the label and the description. v12's `<style>` rules are attributes (no `<style>`
// but `theme: 'auto'`'s): the label's size, colour and weight, the description's size, colour
// and italics, the line's stroke, the icon's `color`, the highlight's fill and stroke. Names and
// descriptions are plain text that keeps its blank runs (`xml:space`, v12's `white-space: pre`,
// D484); no title is drawn (D484).
//
// Each node's `g` carries `data-ast` (and `data-id`); its parts and its connectors `data-id`
// only (pitfall 12, D487). The root row is not an AST node: it carries neither.
import {
  px,
  styleScope,
  styleText,
  themeStyleSheet,
  type Attrs,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { Style } from '@mermaid-js/core/text';
import { treeViewUseMaxWidth } from '../config.ts';
import {
  TREEVIEW_METRICS as M,
  type TreeViewLayout,
  type TreeViewLine,
  type TreeViewRow,
  type TreeViewText,
} from '../layout/index.ts';
import type { TreeViewModel } from '../model.ts';
import { drawIcon, iconsNotRendered } from './assets.ts';
import type { TreeViewRenderContext } from './context.ts';
import { paints, type Paints } from './paint.ts';

/** Writes the whole `<svg>` document for a laid-out treeView. */
export function renderTreeView(
  model: TreeViewModel,
  layout: TreeViewLayout,
  ctx: TreeViewRenderContext,
  w: SvgWriter
): void {
  const paint = paints(ctx.theme, layout);
  openRoot(model, layout, ctx, w);
  w.open('g', { class: 'tree-view' });
  const missed: string[] = [];
  const { lines } = layout;
  let next = 0;
  layout.rows.forEach((row, i) => {
    drawRow(row, paint, ctx, w, missed);
    // The lines v12 drew before the next row: this row's branch and the stems of the subtrees
    // it closes (`drawTree` draws a row's branch with it and a parent's stem after its subtree).
    while (next < lines.length && !(lines[next]!.kind === 'branch' && lines[next]!.row > i))
      drawLine(lines[next++]!, layout, paint, w);
  });
  w.close();
  w.close();
  if (missed.length > 0) iconsNotRendered(ctx, [...new Set(missed)]);
}

/** A row (`positionLabel`): highlight box, icon, label, then its description. */
function drawRow(
  row: TreeViewRow,
  paint: Paints,
  ctx: TreeViewRenderContext,
  w: SvgWriter,
  missed: string[]
): void {
  const id = row.node?.astId;
  w.open('g', { 'data-id': id, 'data-ast': id });
  if (row.highlight) {
    w.leaf('rect', {
      class: 'treeView-highlight-bg',
      'data-id': id,
      ...row.highlight.box,
      rx: row.highlight.radius,
      fill: paint.highlightBg,
      stroke: paint.highlightStroke,
      'stroke-width': M.highlightStroke,
    });
  }
  if (row.icon && !drawIcon(w, ctx, row.icon, id, paint.icon)) missed.push(row.icon.name);
  const cls = row.node?.cssClass;
  text(w, row.label, {
    class: `treeView-node-label${row.directory ? ' treeView-node-dir' : ''}${cls ? ` ${cls}` : ''}`,
    'data-id': id,
    fill: paint.label,
  });
  if (row.description) {
    text(w, row.description, {
      class: 'treeView-node-description',
      'data-id': id,
      fill: paint.description,
    });
  }
  w.close();
}

/** One line of plain text at the layout's point, size and style, its blank runs kept. */
function text(w: SvgWriter, t: TreeViewText, attrs: Attrs): void {
  w.open('text', {
    ...attrs,
    x: t.x,
    y: t.y,
    'dominant-baseline': 'middle',
    'font-size': t.font.size,
    'font-weight': t.style & Style.Bold ? 'bold' : undefined,
    'font-style': t.style & Style.Italic ? 'italic' : undefined,
    'xml:space': 'preserve',
  });
  w.text(t.text);
  w.close();
}

/** A connector (`positionLine`), `data-id` of the node it goes into or comes down from. */
function drawLine(l: TreeViewLine, layout: TreeViewLayout, paint: Paints, w: SvgWriter): void {
  w.leaf('line', {
    class: 'treeView-node-line',
    'data-id': layout.rows[l.row]!.node?.astId,
    x1: l.x1,
    y1: l.y1,
    x2: l.x2,
    y2: l.y2,
    stroke: paint.line,
    'stroke-width': layout.lineThickness,
  });
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133); the viewBox is the bounds. */
function openRoot(
  model: TreeViewModel,
  layout: TreeViewLayout,
  ctx: TreeViewRenderContext,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y, width, height } = layout.bounds;
  const maxWidth = treeViewUseMaxWidth(config.treeView);
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-treeView',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'treeView',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', content: string, id: string): void {
  w.open(tag, { id });
  w.text(content);
  w.close();
}
