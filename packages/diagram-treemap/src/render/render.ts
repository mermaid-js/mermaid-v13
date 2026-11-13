// Draws a laid-out treemap through the SvgWriter (spec #428 T4, DESIGN §7). The layout
// (`layoutTreemap`) placed everything in the diagram's coordinates; this file only paints it, in
// v12's order (`renderer.ts`): the title, then in `g.treemapContainer` one `g.treemapSection` per
// section (d3's breadth-first order) and one `g.treemapLeafGroup` per leaf (d3's `leaves()`).
// v12's class names are kept; a leaf group is `treemapNode treemapLeafGroup leaf<i> <class>`
// without v12's trailing `x` (D403). No `<style>` (but `theme: 'auto'`'s), no `clipPath`, no
// transform: the layout keeps text inside its box (D405) and every box is absolute.
//
// Each section's and leaf's group carries `data-ast`; its rects and texts `data-id` only
// (pitfall 12). The in-text title's text carries both. A `classDef`'s styles are checked
// (R-SEC-2) and written as attributes after v12's own, so they win as v12's `!important` did:
// the shape's on the rect, the text's (`color` as `fill`) on the label and value.
import type { RenderContext } from '@mermaid-js/core';
import { checkStyle, type Attrs, type CheckedStyle, type SvgWriter } from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/core/svg/document';
import { treemapUseMaxWidth } from '../config.ts';
import {
  TREEMAP_METRICS as M,
  type TreemapLayout,
  type TreemapLeafLayout,
  type TreemapSectionLayout,
  type TreemapText,
} from '../layout/index.ts';
import { classStyles, type TreemapModel } from '../model.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type TreemapRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'warn' | 'idPrefix' | 'version'
>;

/** Writes the whole `<svg>` document for a laid-out treemap. */
export function renderTreemap(
  model: TreemapModel,
  layout: TreemapLayout,
  ctx: TreemapRenderContext,
  w: SvgWriter
): void {
  const paint = paints(ctx.theme, layout);
  const styles = classStyleCache(model, ctx);
  openRoot(model, layout, ctx, w);
  if (layout.title) {
    const ast = model.titleAstId;
    text(w, layout.title, {
      class: 'treemapTitle',
      'data-id': ast,
      'data-ast': ast,
      fill: paint.title,
    });
  }
  if (layout.sections.length + layout.leaves.length > 0) {
    w.open('g', { class: 'treemapContainer' });
    for (const s of layout.sections) drawSection(s, paint, styles(s.node.classSelector), w);
    for (const l of layout.leaves) drawLeaf(l, paint, styles(l.node.classSelector), w);
    w.close();
  }
  w.close();
}

/** A class's checked styles, once per class and render (so a dropped style warns once). */
function classStyleCache(
  model: TreemapModel,
  ctx: TreemapRenderContext
): (name: string | undefined) => CheckedStyle {
  const cache = new Map<string, CheckedStyle>();
  return (name) => {
    const key = name ?? '';
    let checked = cache.get(key);
    if (checked === undefined) {
      checked = checkStyle(classStyles(model, name), ctx.warn);
      cache.set(key, checked);
    }
    return checked;
  };
}

/**
 * A class's text styles as v12 wrote them on labels (`styles2String`'s label styles): `color`
 * as the fill, the font and decoration; not `opacity`, which v12 put on the rect only, nor
 * `font-size`, which the layout already fitted from (the drawn size is the layout's).
 */
function textStyles(checked: CheckedStyle): Attrs {
  const { opacity: _o, 'font-size': _s, ...rest } = checked.text as Record<string, unknown>;
  return rest as Attrs;
}

/** One line of text at the layout's point, anchor, baseline and size. */
function text(w: SvgWriter, t: TreemapText, attrs: Attrs): void {
  w.open('text', {
    ...attrs,
    x: t.x,
    y: t.y,
    'text-anchor': t.anchor,
    'dominant-baseline': t.baseline,
    'font-size': t.font.size,
  });
  w.text(t.text);
  w.close();
}

/**
 * A section (`renderer.ts:164-310`): the header band (no fill, no stroke), the rect at
 * `cScale`/`cScalePeer` of its name with the class's shape styles, the bold label and the
 * italic value, both at `cScaleLabel` of its name with the class's text styles.
 */
function drawSection(s: TreemapSectionLayout, paint: Paints, checked: CheckedStyle, w: SvgWriter) {
  const id = s.node.astId;
  w.open('g', { class: 'treemapSection', 'data-id': id, 'data-ast': id });
  w.leaf('rect', {
    class: 'treemapSectionHeader',
    'data-id': id,
    ...s.header,
    fill: 'none',
    'fill-opacity': M.headerFillOpacity,
    'stroke-width': M.headerStroke,
  });
  w.leaf('rect', {
    class: `treemapSection section${s.index}`,
    'data-id': id,
    ...s.box,
    fill: paint.fill(s.fill),
    'fill-opacity': M.sectionFillOpacity,
    stroke: paint.peer(s.fill),
    'stroke-width': M.sectionStroke,
    'stroke-opacity': M.sectionStrokeOpacity,
    ...checked.shape,
  });
  const ink = { 'data-id': id, fill: paint.label(s.labelColor), ...textStyles(checked) };
  if (s.label)
    text(w, s.label, {
      class: 'treemapSectionLabel',
      ...ink,
      'font-weight': checked.text['font-weight'] ?? 'bold',
    });
  if (s.valueText)
    text(w, s.valueText, {
      class: 'treemapSectionValue',
      ...ink,
      'font-style': checked.text['font-style'] ?? 'italic',
    });
  w.close();
}

/**
 * A leaf (`renderer.ts:312-523`): the rect filled and stroked at `cScale` of its parent's name
 * (`transparent` at the top, D404) with the class's shape styles, the label and the value at
 * `cScaleLabel` of its own name with the class's text styles.
 */
function drawLeaf(l: TreemapLeafLayout, paint: Paints, checked: CheckedStyle, w: SvgWriter) {
  const id = l.node.astId;
  const cls = l.node.classSelector;
  w.open('g', {
    class: `treemapNode treemapLeafGroup leaf${l.index}${cls ? ` ${cls}` : ''}`,
    'data-id': id,
    'data-ast': id,
  });
  const colour = paint.fill(l.fill);
  w.leaf('rect', {
    class: 'treemapLeaf',
    'data-id': id,
    ...l.box,
    fill: colour,
    'fill-opacity': M.leafFillOpacity,
    stroke: colour,
    'stroke-width': M.leafStroke,
    ...checked.shape,
  });
  const ink = { 'data-id': id, fill: paint.label(l.labelColor), ...textStyles(checked) };
  if (l.label) text(w, l.label, { class: 'treemapLabel', ...ink });
  if (l.valueText) text(w, l.valueText, { class: 'treemapValue', ...ink });
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(
  model: TreemapModel,
  layout: TreemapLayout,
  ctx: TreemapRenderContext,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  openSvgRoot(w, ctx, {
    name: 'treemap',
    viewBox: [x, y, width, height],
    maxWidth: treemapUseMaxWidth(config.treemap),
    title: model.accTitle.trim(),
    desc: model.accDescr.trim(),
    attrs: { 'font-family': font },
  });
}
