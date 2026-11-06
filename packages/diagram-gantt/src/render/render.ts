/**
 * Draws a laid-out gantt chart through the SvgWriter (DESIGN §7, spec #293 T4). The layout
 * (`layoutGantt`) placed everything; this file only paints it, in v12's `ganttRenderer.js`
 * order: excluded days, the axes, the row bands, the bars and their labels, the section
 * titles, the today line and the title. v12's class names stay. A bar carries `data-id` (the
 * task id) and `data-ast`, its label `data-id` only, a section title `data-id` and `data-ast`
 * (R-PARSE-8, pitfall 12). The only element ids are `<prefix>-title` and `-desc` (R-A11Y-1).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  checkStyle,
  checkUrl,
  px,
  rotate,
  scale,
  styleScope,
  styleText,
  themeStyleSheet,
  transforms,
  translate,
  type Attrs,
  type SafeUrl,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { GANTT_METRICS } from '../layout/metrics.ts';
import type {
  GanttAxis,
  GanttBar,
  GanttLayout,
  GanttSectionLabel,
  PlacedText,
} from '../layout/types.ts';
import type { GanttModel } from '../model.ts';
import { paints, stateOf, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type GanttRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn'
> &
  Partial<Pick<RenderContext, 'securityLevel' | 'linkSchemes'>>;

interface Scene {
  readonly w: SvgWriter;
  readonly model: GanttModel;
  readonly layout: GanttLayout;
  readonly ctx: GanttRenderContext;
  readonly paint: Paints;
}

const M = GANTT_METRICS;

/** Writes the whole `<svg>` document for a laid-out gantt chart. */
export function renderGantt(
  model: GanttModel,
  layout: GanttLayout,
  ctx: GanttRenderContext,
  w: SvgWriter
): void {
  const scene: Scene = { w, model, layout, ctx, paint: paints(ctx.theme, layout) };
  openRoot(scene);
  drawExcludes(scene);
  drawAxis(scene, layout.bottomAxis);
  if (layout.topAxis) drawAxis(scene, layout.topAxis);
  drawBands(scene);
  drawTasks(scene);
  drawSections(scene);
  drawToday(scene);
  drawTitle(scene);
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, model }: Scene): void {
  const { theme, config } = ctx;
  const prefix = ctx.idPrefix;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = (config.gantt as { useMaxWidth?: unknown } | undefined)?.useMaxWidth !== false;
  const auto = theme.autoDeclarations();
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares their aliases.
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    class: 'mermaid mermaid-gantt',
    viewBox: [x, y, width, height],
    width: maxWidth ? '100%' : width,
    height: maxWidth ? undefined : height,
    role: 'img',
    'aria-roledescription': 'gantt',
    'aria-labelledby': title ? `${prefix}-title` : undefined,
    'aria-describedby': desc ? `${prefix}-desc` : undefined,
    'data-mermaid-version': ctx.version,
    'data-p': auto ? styleScope(prefix) : undefined,
    style: styleText(maxWidth ? { 'max-width': px(width) } : {}, theme.rootStyleText()),
    'font-family': font,
    'font-size': fontSize,
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

/**
 * A measured label at its anchor and first baseline. A one-line label of text runs is one
 * `<text>` with v12's `text-anchor`; a label with an inline box (math, D176) or several lines
 * goes through the writer's label layout, centred on the same box.
 */
function drawText(w: SvgWriter, p: PlacedText, attrs: Attrs): void {
  const t = p.text;
  if (t.lines.length === 0) return;
  const runs = t.lines.length === 1 ? t.lines[0]! : undefined;
  const run = runs?.length === 1 ? runs[0]! : undefined;
  if (run && run.kind !== 'box' && !run.attrs && !run.underline && !run.strike) {
    w.open('text', {
      ...attrs,
      x: p.x,
      y: p.y,
      'text-anchor': p.anchor,
      'font-weight': run.bold ? 'bold' : undefined,
      'font-style': run.italic ? 'italic' : undefined,
    });
    w.text(run.text);
    w.close();
    return;
  }
  const shift = { start: t.width / 2, middle: 0, end: -t.width / 2 }[p.anchor];
  const box = p.anchor === 'middle' ? t : { ...t, left: true };
  w.label(box, p.x + shift, p.y - t.baseline + t.height / 2, attrs);
}

/** v12 `drawExcludeDays`: one `exclude-range` rectangle per run of excluded days. */
function drawExcludes({ w, layout, paint }: Scene): void {
  if (layout.excludes.length === 0) return;
  w.open('g');
  for (const r of layout.excludes)
    w.leaf('rect', { class: 'exclude-range', ...r, fill: paint.exclude });
  w.close();
}

/**
 * v12 `makeGrid`: a `grid` group of ticks, each a line across the plot and its label. d3's
 * axis path (`.grid path { stroke-width: 0 }`) drew nothing and is left out.
 */
function drawAxis({ w, paint }: Scene, axis: GanttAxis): void {
  if (axis.ticks.length === 0) return;
  w.open('g', { class: 'grid' });
  for (const t of axis.ticks) {
    w.open('g', { class: 'tick', opacity: M.tickOpacity });
    w.leaf('line', { x1: t.x, y1: axis.y1, x2: t.x, y2: axis.y2, stroke: paint.grid });
    w.open('text', {
      x: t.x,
      y: axis.labelY,
      fill: paint.tickText,
      'font-size': M.tickFontSize,
      'text-anchor': 'middle',
    });
    w.text(t.label);
    w.close();
    w.close();
  }
  w.close();
}

/** One band per row (v12 `section sectionN`). */
function drawBands({ w, layout, paint }: Scene): void {
  if (layout.bands.length === 0) return;
  w.open('g');
  layout.bands.forEach((b, i) =>
    w.leaf('rect', {
      class: `section section${b.slot}`,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      fill: paint.bands[i],
      stroke: 'none',
      opacity: M.bandOpacity,
    })
  );
  w.close();
}

/** The checked `href` of each task id a `click … href` names, the last click winning (v12). */
function linksOf({ model, ctx }: Scene): Map<string, SafeUrl | undefined> {
  const urls = new Map<string, SafeUrl | undefined>();
  const out = new Map<string, SafeUrl | undefined>();
  const options = {
    securityLevel: ctx.securityLevel ?? 'default',
    linkSchemes: ctx.linkSchemes,
    warn: ctx.warn.bind(ctx),
  } as const;
  for (const click of model.clicks) {
    const href = click.href;
    if (href === undefined) continue;
    // One check (and one warning) per URL however many tasks it names.
    if (!urls.has(href)) urls.set(href, checkUrl(href, options));
    for (const id of click.ids) out.set(id, urls.get(href));
  }
  return out;
}

const classes = (...names: (string | false)[]): string => names.filter(Boolean).join(' ');

/** v12's bar classes: `task`, `milestone`/`vert`, the state and slot, `clickable`. */
function barClass(b: GanttBar): string {
  return classes(
    'task',
    b.kind === 'milestone' && 'milestone',
    b.kind === 'vert' && 'vert',
    `${stateOf(b)}${b.slot}`,
    b.clickable && 'clickable'
  );
}

/** v12's label classes: the side and slot, then the state text classes. */
function labelClass(b: GanttBar): string {
  const n = b.slot;
  const side = { inside: 'taskText', right: 'taskTextOutsideRight', left: 'taskTextOutsideLeft' }[
    b.label.side
  ];
  const slotted = b.label.side === 'inside' ? `taskText${n}` : `taskTextOutside${n}`;
  return classes(
    b.clickable && 'clickable',
    side,
    slotted,
    b.active && (b.crit ? `activeCritText${n}` : `activeText${n}`),
    b.done && (b.crit ? `doneCritText${n}` : `doneText${n}`),
    !b.done && b.crit && `critText${n}`,
    b.kind === 'milestone' && 'milestoneText',
    b.kind === 'vert' && 'vertText'
  );
}

function drawBar({ w, paint }: Scene, b: GanttBar, i: number): void {
  const p = paint.bars[i]!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  w.leaf('rect', {
    class: barClass(b),
    'data-id': b.id,
    'data-ast': b.ast,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    rx: b.radius,
    ry: b.radius,
    fill: p.fill,
    stroke: p.stroke,
    'stroke-width': p.stroke === undefined ? undefined : M.barStrokeWidth,
    // v12's CSS `rotate(45deg) scale(0.8)` about the square's centre, in the element.
    transform:
      b.scale === undefined
        ? undefined
        : transforms(
            rotate(M.milestoneRotation, cx, cy),
            translate(cx, cy),
            scale(b.scale),
            translate(-cx, -cy)
          ),
  });
}

function drawLabel({ w, layout, paint }: Scene, b: GanttBar, i: number): void {
  drawText(w, b.label, {
    class: labelClass(b),
    'data-id': b.id,
    fill: paint.labels[i],
    'font-size': b.kind === 'vert' ? M.vertFontSize : layout.fontSize,
  });
}

/**
 * v12 `drawRects`: every bar, then every label; a linked task's bar and label after them in
 * one `<a href>` (v12 moved them into an `<a>` appended last, under `sandbox` only), with no
 * `target` (R-SVG-4, R-SEC-4). An unsafe URL draws the task unlinked (`URL_REFUSED`).
 */
function drawTasks(scene: Scene): void {
  const { w, layout } = scene;
  if (layout.bars.length === 0) return;
  const links = linksOf(scene);
  const hrefOf = (b: GanttBar): SafeUrl | undefined => (b.clickable ? links.get(b.id) : undefined);
  const linked: number[] = [];
  w.open('g');
  layout.bars.forEach((b, i) => (hrefOf(b) ? linked.push(i) : drawBar(scene, b, i)));
  layout.bars.forEach((b, i) => {
    if (!hrefOf(b)) drawLabel(scene, b, i);
  });
  for (const i of linked) {
    const b = layout.bars[i]!;
    w.open('a', { href: hrefOf(b) });
    drawBar(scene, b, i);
    drawLabel(scene, b, i);
    w.close();
  }
  w.close();
}

/**
 * v12 `vertLabels`: a section title's lines, 1em apart, each centred on its own line
 * (`alignment-baseline: central`), the block centred on the section's rows.
 */
function drawSection({ w, layout, paint }: Scene, s: GanttSectionLabel, i: number): void {
  const t = s.text;
  if (t.lines.length === 0) return;
  const pitch = s.lineHeight;
  const box = {
    lines: t.lines,
    lineHeight: pitch,
    height: t.lines.length * pitch,
    baseline: pitch / 2 + t.baseline - t.lineHeight / 2,
    width: t.width,
    indents: t.indents,
    left: true,
  };
  w.label(box, s.x + t.width / 2, s.y, {
    class: `sectionTitle sectionTitle${s.slot}`,
    'data-id': s.section,
    'data-ast': s.ast,
    fill: paint.sections[i],
    'font-size': layout.sectionFontSize,
  });
}

function drawSections(scene: Scene): void {
  if (scene.layout.sections.length === 0) return;
  scene.w.open('g');
  scene.layout.sections.forEach((s, i) => drawSection(scene, s, i));
  scene.w.close();
}

/** v12 `drawToday`: `todayMarker` split on `,` (and `;`, as v12's `style` read it), checked. */
function drawToday({ w, layout, ctx, paint }: Scene): void {
  const t = layout.today;
  if (!t) return;
  const style = t.style === undefined ? undefined : checkStyle(t.style.split(/[,;]/), ctx.warn);
  w.open('g', { class: 'today' });
  w.leaf('line', {
    class: 'today',
    x1: t.x,
    y1: t.y1,
    x2: t.x,
    y2: t.y2,
    fill: 'none',
    stroke: paint.today,
    'stroke-width': M.todayStrokeWidth,
    ...style?.shape,
  });
  w.close();
}

/** The title (D218), centred, v12 `.titleText { font-size: 18px }`. */
function drawTitle({ w, layout, paint }: Scene): void {
  if (!layout.title) return;
  drawText(w, layout.title, {
    class: 'titleText',
    fill: paint.title,
    'font-size': M.titleFontSize,
  });
}
