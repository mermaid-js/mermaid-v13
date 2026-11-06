// Draws a laid-out pie chart through the SvgWriter (spec #288 T4, DESIGN §7). The layout
// (`layoutPie`) placed everything; this file only paints it, in v12's order: the outer circle,
// the slices and their percentages about the pie's centre, the title, then one legend row per
// section. v12's class names are kept (`pieOuterCircle`, `pieCircle`, `highlighted`,
// `highlightedOnHover`, `slice`, `pieTitleText`, `legend`). Each section's legend row is the
// one element that carries its `data-ast` (every section has a row, shown or not); the slice
// and its percentage carry `data-id` only (pitfall 12).
import type { RenderContext } from '@mermaid-js/core';
import { px, scale, styleScope, styleText, themeStyleSheet, translate } from '@mermaid-js/core/svg';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { slicePath } from '../layout/index.ts';
import type { PieLayout, PlacedLabel } from '../layout/index.ts';
import type { PieModel } from '../model.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type PieRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'warn' | 'idPrefix' | 'version'
>;

/** `highlightSlice: hover` draws nothing extra (D222); one warning per render says so. */
export const PIE_HOVER_IGNORED = 'PIE_HOVER_IGNORED';

/** A highlighted slice is opaque (v12 `.highlighted { opacity: 1 }`). */
const OPAQUE = 1;

/** Writes the whole `<svg>` document for a laid-out pie chart. */
export function renderPie(
  model: PieModel,
  layout: PieLayout,
  ctx: PieRenderContext,
  w: SvgWriter
): void {
  if (layout.hover)
    ctx.warn({
      code: PIE_HOVER_IGNORED,
      message:
        'pie.highlightSlice "hover" is accepted but draws nothing extra: the SVG has no hover styles',
      path: 'pie.highlightSlice',
    });
  const paint = paints(
    ctx.theme,
    layout.legend.map((r) => r.colour),
    layout.title !== undefined
  );
  openRoot(model, layout, ctx, w);
  drawPie(layout, paint, w);
  if (layout.title)
    w.label(layout.title.text, centreX(layout.title), centreY(layout.title), {
      class: 'pieTitleText',
      fill: paint.title,
      'font-size': layout.fonts.title.size,
    });
  for (const row of layout.legend) {
    w.open('g', { class: 'legend', 'data-id': row.ast, 'data-ast': row.ast });
    const fill = paint.slot(row.colour);
    w.leaf('rect', { ...row.swatch, fill, stroke: fill });
    // Left-aligned at the row's text start, as v12's start-anchored text.
    w.label({ ...row.label.text, left: true }, centreX(row.label), centreY(row.label), {
      fill: paint.legend,
      'font-size': layout.fonts.legend.size,
    });
    w.close();
  }
  w.close();
}

const centreX = (r: PlacedLabel): number => r.x + r.width / 2;
const centreY = (r: PlacedLabel): number => r.y + r.height / 2;

/** The outer circle, the slices and the percentages, in a group at the pie's centre. */
function drawPie(layout: PieLayout, paint: Paints, w: SvgWriter): void {
  const { center } = layout;
  w.open('g', { transform: translate(center.x, center.y) });
  w.leaf('circle', {
    class: 'pieOuterCircle',
    cx: 0,
    cy: 0,
    r: layout.outerRadius,
    fill: 'none',
    stroke: paint.outerStroke,
    'stroke-width': layout.outerStrokeWidth,
  });
  // v12's classes: every slice under `hover`, else the named one.
  const marked = layout.hover ? 'pieCircle highlightedOnHover' : 'pieCircle highlighted';
  for (const s of layout.slices) {
    const highlighted = s.highlighted;
    w.leaf('path', {
      class: layout.hover || highlighted ? marked : 'pieCircle',
      'data-id': s.ast,
      d: slicePath(s, layout.innerRadius, layout.radius),
      transform: highlighted ? scale(layout.highlightScale) : undefined,
      fill: paint.slot(s.colour),
      stroke: paint.stroke,
      'stroke-width': layout.strokeWidth,
      opacity: highlighted ? OPAQUE : paint.opacity,
    });
  }
  for (const s of layout.slices)
    w.label(s.percent.text, centreX(s.percent) - center.x, centreY(s.percent) - center.y, {
      class: 'slice',
      'data-id': s.ast,
      fill: paint.section,
      'font-size': layout.fonts.section.size,
    });
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(model: PieModel, layout: PieLayout, ctx: PieRenderContext, w: SvgWriter): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = config.pie?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  const auto = theme.autoDeclarations();
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-pie',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'pie',
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

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id: string): void {
  w.open(tag, { id });
  w.text(text);
  w.close();
}
