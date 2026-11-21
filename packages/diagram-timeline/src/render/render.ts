// Draws a laid-out timeline through the SvgWriter (DESIGN §7, spec #291 T4). The layout
// (`layoutTimeline`) placed everything, in both directions (D250); this file only paints it,
// in v12's stacking order: LR draws the sections, then each period with its connector and its
// events, the title and the axis on top; TD draws the axis first, and each event before its
// connector. Sections, periods and events carry `data-id` and `data-ast` (R-PARSE-8); their
// labels and connectors `data-id` only. v12's class names stay where they still apply
// (`timeline-node`, `section-<n>`, `taskWrapper`, `eventWrapper`, `lineWrapper`).
import type { RenderContext } from '@mermaid-js/core';
import type { SafeValue, SvgWriter } from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/shared/svg/document';
import { fontSizePx } from '@mermaid-js/core/text';
import { TIMELINE_METRICS } from '../layout/metrics.ts';
import type {
  TimelineBox,
  TimelineConnector,
  TimelineLayout,
  TimelineLine,
} from '../layout/types.ts';
import type { TimelineModel } from '../model.ts';
import { paints, PALETTE_SLOTS, type BoxPaint, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type TimelineRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version'
>;

interface Scene {
  readonly w: SvgWriter;
  readonly model: TimelineModel;
  readonly layout: TimelineLayout;
  readonly ctx: TimelineRenderContext;
  readonly paint: Paints;
}

/** v12's connectors: `stroke-dasharray: 5,5`. */
const DASH = '5, 5' as SafeValue;
/** v12 `svgDraw.js`: a label's first line is centred `1em` below its offset (`dy="1em"`). */
const FIRST_LINE_EM = 1;

/** Writes the whole `<svg>` document for a laid-out timeline. */
export function renderTimeline(
  model: TimelineModel,
  layout: TimelineLayout,
  ctx: TimelineRenderContext,
  w: SvgWriter
): void {
  const scene: Scene = { w, model, layout, ctx, paint: paints(ctx, layout.title !== undefined) };
  openRoot(scene);
  if (layout.direction === 'TD') drawAxis(scene);
  drawSections(scene);
  drawPeriods(scene);
  drawTitle(scene);
  if (layout.direction === 'LR') drawAxis(scene);
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, model }: Scene): void {
  const { theme, config } = ctx;
  // Read before the root style is written, so it declares their aliases.
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  openSvgRoot(w, ctx, {
    name: 'timeline',
    viewBox: layout.bounds,
    maxWidth: config.timeline?.useMaxWidth !== false,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': font,
      'font-size': fontSize,
    },
  });
}

/** v12's class for slot `slot`: `section-<slot mod 12 − 1>`, so slot 0 is `section--1`. */
const sectionClass = (slot: number): number => (slot % PALETTE_SLOTS) - 1;

/**
 * One box (v12 `drawNode`): a `timeline-node section-<n>` group with the background path, the
 * rule under it where the theme draws one, and the label `offset` below its top.
 */
function drawNode(
  scene: Scene,
  box: TimelineBox,
  paint: BoxPaint,
  offset: number,
  ast?: string
): void {
  const { w } = scene;
  const n = sectionClass(box.slot);
  w.open('g', {
    class: `timeline-node section-${n}`,
    'data-id': box.ast,
    'data-ast': ast,
    'data-color-id': paint.colorId,
  });
  w.leaf('path', {
    class: 'node-bkg',
    d: boxPath(scene, box),
    fill: paint.fill,
    stroke: paint.stroke,
    'stroke-width': paint.strokeWidth,
    filter: paint.stroke === undefined ? undefined : scene.paint.shadow,
  });
  const bottom = box.y + box.height;
  if (paint.rule)
    w.leaf('line', {
      class: `node-line-${n}`,
      x1: box.x,
      y1: bottom,
      x2: box.x + box.width,
      y2: bottom,
      stroke: paint.rule.stroke,
      'stroke-width': paint.rule.width,
    });
  const label = box.label;
  const lead = scene.ctx.theme.number('fontSize') * FIRST_LINE_EM;
  const top = box.y + offset + lead - label.lineHeight / 2;
  w.label(label, box.x + box.width / 2, top + label.height / 2, {
    'data-id': box.ast,
    fill: paint.text,
    ...scene.paint.label,
  });
  w.close();
}

/** v12 `defaultBkg`: the top corners rounded by `timelineRadius`, the bottom square. */
function boxPath(scene: Scene, b: TimelineBox) {
  const r = Math.max(0, Math.min(scene.paint.radius, b.width / 2, b.height / 2));
  const x2 = b.x + b.width;
  const y2 = b.y + b.height;
  const p = scene.w.path().moveTo(b.x, y2);
  if (r > 0)
    p.lineTo(b.x, b.y + r)
      .quadTo(b.x, b.y, b.x + r, b.y)
      .lineTo(x2 - r, b.y)
      .quadTo(x2, b.y, x2, b.y + r);
  else p.lineTo(b.x, b.y).lineTo(x2, b.y);
  return p.lineTo(x2, y2).close().done();
}

function drawSections(scene: Scene): void {
  const { paint } = scene;
  for (const s of scene.layout.sections) {
    drawNode(scene, s, paint.box(s.slot), paint.labelOffset(s.padding), s.ast);
  }
}

/** Each period (`taskWrapper`), then (LR) its connector and its events (`eventWrapper`). */
function drawPeriods(scene: Scene): void {
  const { w, layout, paint } = scene;
  // Connectors by period, and (TD) by event within it: one lookup per box, not a scan.
  const byPeriod = new Map<number, TimelineConnector[]>();
  for (const c of layout.connectors) {
    const list = byPeriod.get(c.period) ?? [];
    list.push(c);
    byPeriod.set(c.period, list);
  }
  layout.periods.forEach((p, i) => {
    const connectors = byPeriod.get(i) ?? [];
    w.open('g', { class: 'taskWrapper', 'data-id': p.ast, 'data-ast': p.ast });
    drawNode(scene, p, paint.box(p.slot), paint.labelOffset(p.padding));
    w.close();
    const byEvent = new Map<number, TimelineConnector[]>();
    if (layout.direction === 'LR') for (const c of connectors) drawConnector(scene, c, p.ast);
    else
      for (const c of connectors) {
        const list = byEvent.get(c.event ?? -1) ?? [];
        list.push(c);
        byEvent.set(c.event ?? -1, list);
      }
    p.events.forEach((e, k) => {
      w.open('g', { class: 'eventWrapper', 'data-id': e.ast, 'data-ast': e.ast });
      drawNode(scene, e, paint.event(e.slot), paint.eventLabelOffset(e.padding));
      w.close();
      for (const c of byEvent.get(k) ?? []) drawConnector(scene, c, e.ast);
    });
  });
}

function drawConnector(scene: Scene, c: TimelineConnector, id: string): void {
  scene.w.open('g', { class: 'lineWrapper', 'data-id': id });
  drawLine(scene, c, true);
  scene.w.close();
}

/** A line and its inline arrowhead (D253), in the theme's line paint. */
function drawLine(scene: Scene, l: TimelineLine, dashed: boolean): void {
  const { w, paint } = scene;
  w.leaf('line', {
    x1: l.x1,
    y1: l.y1,
    x2: l.x2,
    y2: l.y2,
    stroke: paint.line,
    'stroke-width': l.width,
    'stroke-dasharray': dashed ? DASH : undefined,
  });
  const { tip, left, right } = l.arrow;
  w.leaf('path', {
    class: 'arrowhead',
    d: w.path().moveTo(left.x, left.y).lineTo(tip.x, tip.y).lineTo(right.x, right.y).close().done(),
    fill: paint.line,
  });
}

function drawAxis(scene: Scene): void {
  scene.w.open('g', { class: 'lineWrapper' });
  drawLine(scene, scene.layout.axis, false);
  scene.w.close();
}

/** The title (D218): bold, `4ex`, left-aligned where the layout put it (D254). */
function drawTitle(scene: Scene): void {
  const t = scene.layout.title;
  if (!t) return;
  const { common } = TIMELINE_METRICS;
  const fontSize = scene.ctx.theme.number('fontSize');
  const size = fontSizePx(common.titleFontSize, fontSize)!;
  scene.w.label({ ...t.text, left: true }, t.x + t.text.width / 2, t.y + t.height / 2, {
    class: 'timeline-title',
    fill: scene.paint.title,
    'font-size': size,
    'font-weight': String(common.titleFontWeight) as SafeValue,
  });
}
