// Draws a laid-out quadrant chart through the SvgWriter (spec #289 T4, DESIGN §7). The layout
// (`layoutQuadrant`) placed every anchor as v12's builder did; this file measures the labels
// (D225), grows the bounding box over whatever is drawn past the chart (D224) and paints it in
// v12's order: `g.main` > `g.quadrants`, `g.border`, `g.data-points`, `g.labels`, `g.title`.
// Every element drawn from an AST node carries `data-ast`, exactly one per node (R-PARSE-8).
import type { RenderContext } from '@mermaid-js/core';
import {
  px,
  rotate,
  styleScope,
  styleText,
  themeStyleSheet,
  transforms,
  translate,
  type Attrs,
  type Paint,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { QuadrantModel } from '../model.ts';
import type { QuadrantLayout, QuadrantTextAnchor } from '../layout/types.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type QuadrantRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'warn' | 'idPrefix' | 'version' | 'measurer' | 'inline'
>;

/** A text anchor with its measured label. */
interface Placed {
  readonly at: QuadrantTextAnchor;
  readonly label: MeasuredLabel;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly model: QuadrantModel;
  readonly layout: QuadrantLayout;
  readonly ctx: QuadrantRenderContext;
  readonly paint: Paints;
  readonly measure: (at: QuadrantTextAnchor) => Placed;
}

/** v12 draws text in the root font at its configured size, never bold. */
const FONT_WEIGHT = 400;

/** Writes the whole `<svg>` document for a laid-out quadrant chart. */
export function renderQuadrant(
  model: QuadrantModel,
  layout: QuadrantLayout,
  ctx: QuadrantRenderContext,
  w: SvgWriter
): void {
  const family = ctx.theme.value('fontFamily');
  const measured = new Map<QuadrantTextAnchor, Placed>();
  const measure = (at: QuadrantTextAnchor): Placed => {
    let p = measured.get(at);
    if (!p) {
      const font: FontKey = { family, size: at.fontSize, weight: FONT_WEIGHT };
      // No wrap width: labels break only where they say so (D225).
      const label = layoutLabel(at.label.text, font, Infinity, ctx.measurer, {
        markdown: at.label.markdown,
        ...(ctx.inline ? { inline: ctx.inline } : {}),
      });
      measured.set(at, (p = { at, label }));
    }
    return p;
  };
  const scene: Scene = { w, model, layout, ctx, paint: paints(ctx.theme, layout), measure };
  openRoot(scene, bounds(scene));
  w.open('g', { class: 'main' });
  drawQuadrants(scene);
  drawBorders(scene);
  drawPoints(scene);
  drawAxisLabels(scene);
  drawTitle(scene);
  w.close();
  w.close();
}

/** Every text anchor that draws a label. */
function anchors(layout: QuadrantLayout): QuadrantTextAnchor[] {
  return [
    ...layout.quadrants.map((q) => q.text),
    ...layout.points.map((p) => p.text),
    ...layout.axisLabels.map((l) => l.text),
    ...(layout.title ? [layout.title] : []),
  ].filter((t) => t.label.text !== '');
}

/**
 * The box v12's fixed `0 0 chartWidth chartHeight` placement draws in, grown over anything
 * drawn past it (D224): v12 let long point labels run off the chart, where browsers clipped
 * them. A label's box follows v12's `text-anchor`, `dominant-baseline` and rotation.
 */
function bounds(scene: Scene): Box {
  const { layout } = scene;
  const box: Box = { minX: 0, minY: 0, maxX: layout.width, maxY: layout.height };
  const put = (x: number, y: number): void => {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  };
  for (const p of layout.points) {
    put(p.cx - p.radius, p.cy - p.radius);
    put(p.cx + p.radius, p.cy + p.radius);
  }
  for (const at of anchors(layout)) {
    const { label } = scene.measure(at);
    if (label.lines.length === 0) continue;
    const x0 = at.anchor === 'start' ? 0 : -label.width / 2;
    const y0 = at.baseline === 'hanging' ? 0 : -label.height / 2;
    const rad = (at.rotation * Math.PI) / 180;
    // Snapped, so a quarter turn is exact.
    const cos = Math.round(Math.cos(rad) * 1e9) / 1e9;
    const sin = Math.round(Math.sin(rad) * 1e9) / 1e9;
    for (const [x, y] of [
      [x0, y0],
      [x0 + label.width, y0],
      [x0, y0 + label.height],
      [x0 + label.width, y0 + label.height],
    ] as const)
      put(at.x + x * cos - y * sin, at.y + x * sin + y * cos);
  }
  return {
    minX: Math.floor(box.minX),
    minY: Math.floor(box.minY),
    maxX: Math.ceil(box.maxX),
    maxY: Math.ceil(box.maxY),
  };
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, ctx, model }: Scene, box: Box): void {
  const { theme, config } = ctx;
  const prefix = (): string => ctx.idPrefix;
  const width = Math.max(1, box.maxX - box.minX);
  const height = Math.max(1, box.maxY - box.minY);
  const maxWidth = config.quadrantChart?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares their aliases.
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-quadrant',
    viewBox: [box.minX, box.minY, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'quadrantChart',
    'aria-labelledby': title ? `${prefix()}-title` : undefined,
    'aria-describedby': desc ? `${prefix()}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix()) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
    'font-size': fontSize,
  });
  if (auto) w.styleSheet(themeStyleSheet(styleScope(prefix()), auto.light, auto.dark));
  if (title) textElement(w, 'title', title, `${prefix()}-title`);
  if (desc) textElement(w, 'desc', desc, `${prefix()}-desc`);
}

function textElement(w: SvgWriter, tag: 'title' | 'desc', text: string, id: string): void {
  w.open(tag, { id });
  w.text(text);
  w.close();
}

/** The text of a label that is one plain run, or undefined. */
function plainText(label: MeasuredLabel): string | undefined {
  if (label.lines.length !== 1) return undefined;
  const line = label.lines[0]!;
  if (line.length !== 1) return undefined;
  const run = line[0]!;
  const styled =
    run.kind === 'box' ||
    run.bold === true ||
    run.italic === true ||
    run.underline === true ||
    run.strike === true ||
    run.attrs !== undefined;
  return styled ? undefined : run.text;
}

/**
 * A label at its anchor, placed as v12 placed it: `translate(x, y) rotate(r)`. A plain label is
 * v12's one `<text>` with its `text-anchor` and `dominant-baseline`. A label with breaks,
 * markdown or inline boxes (D225) is laid out by core and drawn so its box sits where v12's
 * `text-anchor` and `dominant-baseline` would put one line's.
 */
function drawText(scene: Scene, at: QuadrantTextAnchor, fill: Paint | undefined): void {
  const { w } = scene;
  const { label } = scene.measure(at);
  if (label.lines.length === 0) return;
  const transform = transforms(translate(at.x, at.y), rotate(at.rotation));
  const text = plainText(label);
  if (text !== undefined) {
    w.open('text', {
      x: 0,
      y: 0,
      fill,
      'font-size': at.fontSize,
      'dominant-baseline': at.baseline,
      'text-anchor': at.anchor,
      transform,
    });
    w.text(text);
    w.close();
    return;
  }
  const attrs: Attrs = { fill, 'font-size': at.fontSize, transform };
  const start = at.anchor === 'start';
  w.label(
    start ? { ...label, left: true } : label,
    start ? label.width / 2 : 0,
    at.baseline === 'hanging' ? label.height / 2 : 0,
    attrs
  );
}

/** v12 `g.quadrants`: each quadrant's rect and label. */
function drawQuadrants(scene: Scene): void {
  const { w, layout, paint } = scene;
  w.open('g', { class: 'quadrants' });
  for (const q of layout.quadrants) {
    const p = paint.quadrants[q.quadrant - 1]!;
    w.open('g', { class: 'quadrant', 'data-id': `quadrant-${q.quadrant}`, 'data-ast': q.ast });
    w.leaf('rect', { x: q.x, y: q.y, width: q.width, height: q.height, fill: p.fill });
    drawText(scene, q.text, p.text);
    w.close();
  }
  w.close();
}

/** v12 `g.border`: the four outer lines, then the two inner ones. */
function drawBorders({ w, layout, paint }: Scene): void {
  w.open('g', { class: 'border' });
  for (const b of layout.borders)
    w.leaf('line', {
      x1: b.x1,
      y1: b.y1,
      x2: b.x2,
      y2: b.y2,
      stroke: b.kind === 'external' ? paint.externalBorder : paint.internalBorder,
      'stroke-width': b.strokeWidth,
    });
  w.close();
}

/** v12 `g.data-points`: the last-declared point first, so the first is drawn on top. */
function drawPoints(scene: Scene): void {
  const { w, layout, model, paint } = scene;
  const names = new Map(model.points.map((p) => [p.ast, p.label.text]));
  w.open('g', { class: 'data-points' });
  for (let i = layout.points.length - 1; i >= 0; i--) {
    const p = layout.points[i]!;
    const pp = paint.points[i]!;
    w.open('g', { class: 'data-point', 'data-id': names.get(p.ast), 'data-ast': p.ast });
    w.leaf('circle', {
      cx: p.cx,
      cy: p.cy,
      r: p.radius,
      fill: pp.fill,
      stroke: pp.stroke,
      'stroke-width': p.strokeWidth,
    });
    drawText(scene, p.text, paint.pointText);
    w.close();
  }
  w.close();
}

/** v12 `g.labels`: the axis labels, x start and end, then y. */
function drawAxisLabels(scene: Scene): void {
  const { w, layout, paint } = scene;
  w.open('g', { class: 'labels' });
  for (const l of layout.axisLabels) {
    w.open('g', { class: 'label', 'data-id': `${l.axis}-axis-${l.end}`, 'data-ast': l.ast });
    drawText(scene, l.text, l.axis === 'x' ? paint.xAxisText : paint.yAxisText);
    w.close();
  }
  w.close();
}

/** v12 `g.title`, empty when the chart has no title. */
function drawTitle(scene: Scene): void {
  const { w, layout, paint } = scene;
  const t = layout.title;
  w.open('g', { class: 'title', 'data-id': t ? 'title' : undefined, 'data-ast': t?.ast });
  if (t) drawText(scene, t, paint.title);
  w.close();
}
