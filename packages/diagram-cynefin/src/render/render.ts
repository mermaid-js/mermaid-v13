// Draws a laid-out cynefin diagram through the SvgWriter (spec #423 T4, DESIGN §7). The layout
// (`layoutCynefin`) placed everything; this file only paints it, in v12's order and with v12's
// classes, inside one group translated by the padding: `g.cynefin-backgrounds`,
// `g.cynefin-boundaries`, `path.cynefinConfusion`, `g.cynefin-labels`, `g.cynefin-subtitles`
// (with descriptions only), `g.cynefin-items` (always), `g.cynefin-arrows` (with transitions
// only) and `text.cynefinTitle`. No `<marker>`: each arrowhead is a `path.cynefinArrowHead`.
//
// `data-ast` marks one element per drawn AST node (pitfall 12): a declared domain's quadrant
// rect or ellipse, each item's `g` and each transition's line. Labels, subtitles, arrowheads and
// arrow labels carry `data-id` only.
import type { RenderContext } from '@mermaid-js/core';
import { openSvgRoot, translate, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import type { CynefinBadge, CynefinFont, CynefinLayout, PlacedLabel } from '../layout/index.ts';
import { FONTS } from '../layout/metrics.ts';
import type { CynefinModel } from '../model.ts';
import { CYNEFIN_PAINT, paints, type Paints } from './paint.ts';
import { arrowheadData, curveData, ellipseData, transitionData } from './path.ts';

/** What the renderer reads from the render context. */
export type CynefinRenderContext = Pick<RenderContext, 'config' | 'theme' | 'idPrefix' | 'version'>;

/** Writes the whole `<svg>` document for a laid-out cynefin diagram. */
export function renderCynefin(
  model: CynefinModel,
  layout: CynefinLayout,
  ctx: CynefinRenderContext,
  w: SvgWriter
): void {
  const paint = paints(ctx.theme);
  openRoot(model, layout, ctx, w);
  w.open('g', { transform: translate(layout.offset.x, layout.offset.y) });
  drawCanvas(layout, paint, w);
  drawTexts(layout, paint, w);
  drawItems(layout, paint, w);
  drawTransitions(layout, paint, w);
  if (layout.title)
    label(w, layout.title, layout.fonts.title, {
      class: 'cynefinTitle',
      'data-id': 'title',
      fill: paint.label,
    });
  w.close();
  w.close();
}

/** The quadrants, the three boundaries and the ellipse (:116-166). */
function drawCanvas(layout: CynefinLayout, paint: Paints, w: SvgWriter): void {
  w.open('g', { class: 'cynefin-backgrounds' });
  for (const q of layout.quadrants)
    w.leaf('rect', {
      class: 'cynefinDomain',
      'data-id': q.name,
      'data-ast': q.ast,
      x: q.x,
      y: q.y,
      width: q.width,
      height: q.height,
      fill: paint.background(q.name),
      'fill-opacity': CYNEFIN_PAINT.quadrantOpacity,
      stroke: 'none',
    });
  w.close();

  const { fold, horizon, cliff } = layout.boundaries;
  const boundary = {
    class: 'cynefinBoundary',
    fill: 'none',
    stroke: paint.boundary,
    'stroke-width': layout.strokes.boundary,
    'stroke-dasharray': CYNEFIN_PAINT.boundaryDash,
  } as const;
  w.open('g', { class: 'cynefin-boundaries' });
  w.leaf('path', { ...boundary, d: curveData(fold) });
  w.leaf('path', { ...boundary, d: curveData(horizon) });
  w.leaf('path', {
    class: 'cynefinCliff',
    d: curveData(cliff),
    fill: 'none',
    stroke: paint.cliff,
    'stroke-width': layout.strokes.cliff,
  });
  w.close();

  const e = layout.confusion;
  w.leaf('path', {
    class: 'cynefinConfusion',
    'data-id': 'confusion',
    'data-ast': e.ast,
    d: ellipseData(e),
    fill: paint.background('confusion'),
    'fill-opacity': CYNEFIN_PAINT.ellipseOpacity,
    stroke: paint.boundary,
    'stroke-width': e.strokeWidth,
    'stroke-dasharray': CYNEFIN_PAINT.ellipseDash,
  });
}

/** Domain labels, then the subtitles when descriptions are on (:168-225). */
function drawTexts(layout: CynefinLayout, paint: Paints, w: SvgWriter): void {
  w.open('g', { class: 'cynefin-labels' });
  for (const t of layout.labels)
    label(w, t, layout.fonts.label, {
      class: 'cynefinDomainLabel',
      'data-id': t.domain,
      fill: paint.label,
    });
  w.close();
  if (!layout.showDomainDescriptions) return;
  w.open('g', { class: 'cynefin-subtitles' });
  for (const t of layout.subtitles)
    label(w, t, layout.fonts.subtitle, {
      class: 'cynefinSubtitle',
      'data-id': t.domain,
      fill: paint.text,
    });
  w.close();
}

/**
 * Item badges and confusion's `+N more` (:229-348), each a translated `g` as in v12. The badge
 * stands for confusion's items past the third, which have no element of their own, so it
 * carries neither `data-id` nor `data-ast`.
 */
function drawItems(layout: CynefinLayout, paint: Paints, w: SvgWriter): void {
  const stroke = layout.strokes.item;
  const font = layout.fonts.item;
  w.open('g', { class: 'cynefin-items' });
  for (const item of layout.items) {
    w.open('g', { 'data-id': item.id, 'data-ast': item.ast, transform: translate(item.x, item.y) });
    badge(w, item, paint, stroke, {
      class: 'cynefinItem',
      'fill-opacity': CYNEFIN_PAINT.itemOpacity,
    });
    badgeLabel(w, item, font, paint);
    w.close();
  }
  const more = layout.overflow;
  if (more) {
    w.open('g', { transform: translate(more.x, more.y) });
    badge(w, more, paint, stroke, {
      class: 'cynefinItemOverflow',
      'fill-opacity': CYNEFIN_PAINT.overflowOpacity,
      'stroke-dasharray': CYNEFIN_PAINT.overflowDash,
    });
    badgeLabel(w, more, font, paint);
    w.close();
  }
  w.close();
}

/** A badge's rect at its group's origin, outlined 1 px (styles.ts :48, :57). */
function badge(w: SvgWriter, b: CynefinBadge, paint: Paints, stroke: number, attrs: Attrs): void {
  w.leaf('rect', {
    ...attrs,
    x: 0,
    y: 0,
    width: b.width,
    height: b.height,
    rx: b.radius,
    ry: b.radius,
    fill: paint.background(b.domain),
    stroke: paint.boundary,
    'stroke-width': stroke,
  });
}

/** A badge's text, centred in it, in its group's coordinates. */
function badgeLabel(w: SvgWriter, b: CynefinBadge, font: CynefinFont, paint: Paints): void {
  const l = b.label;
  w.label(l.text, l.x + l.width / 2 - b.x, l.y + l.height / 2 - b.y, {
    class: 'cynefinItemText',
    ...fontAttrs(font),
    fill: paint.text,
  });
}

/** Transitions (:350-419): line, arrowhead, then the label. */
function drawTransitions(layout: CynefinLayout, paint: Paints, w: SvgWriter): void {
  if (layout.transitions.length === 0) return;
  w.open('g', { class: 'cynefin-arrows' });
  for (const t of layout.transitions) {
    const id = `${t.from}-${t.to}`;
    w.leaf('path', {
      class: 'cynefinArrowLine',
      'data-id': id,
      'data-ast': t.ast,
      d: transitionData(t),
      fill: 'none',
      stroke: paint.arrow,
      'stroke-width': layout.strokes.arrow,
    });
    w.leaf('path', {
      class: 'cynefinArrowHead',
      'data-id': id,
      d: arrowheadData(t),
      fill: paint.arrow,
      stroke: 'none',
    });
    if (t.label)
      label(w, t.label, layout.fonts.transition, {
        class: 'cynefinArrowLabel',
        'data-id': id,
        fill: paint.text,
      });
  }
  w.close();
}

/** A placed label, centred in its box, in its font. */
function label(w: SvgWriter, p: PlacedLabel, font: CynefinFont, attrs: Attrs): void {
  w.label(p.text, p.x + p.width / 2, p.y + p.height / 2, { ...attrs, ...fontAttrs(font) });
}

/** The font a text was measured in, as attributes; the family is the root's. */
function fontAttrs(f: CynefinFont): Attrs {
  return {
    'font-size': f.size,
    // The layout measures bold at `FONTS.bold`; v12's CSS wrote it `bold`.
    'font-weight': f.weight >= FONTS.bold ? 'bold' : undefined,
    'font-style': f.style === 'italic' ? 'italic' : undefined,
  };
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(
  model: CynefinModel,
  layout: CynefinLayout,
  ctx: CynefinRenderContext,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  const { x, y } = layout.viewBox;
  const width = Math.max(1, Math.ceil(layout.viewBox.width));
  const height = Math.max(1, Math.ceil(layout.viewBox.height));
  const maxWidth = config.cynefin?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  openSvgRoot(w, ctx, {
    name: 'cynefin',
    viewBox: [x, y, width, height],
    maxWidth,
    title,
    desc,
    attrs: { 'font-family': font },
  });
}
