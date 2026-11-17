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
  rotate,
  scale,
  transforms,
  translate,
  type Attrs,
  type SafeUrl,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/shared/svg/document';
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
  // Read before the root style is written, so it declares their aliases.
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  openSvgRoot(w, ctx, {
    name: 'gantt',
    viewBox: layout.bounds,
    maxWidth: (config.gantt as { useMaxWidth?: unknown } | undefined)?.useMaxWidth !== false,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': font,
      'font-size': fontSize,
    },
  });
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

/**
 * Each linked bar's checked URL, by bar index. The layout gives a bar its `href` as v12's
 * `setLink` kept it (a task that existed when the click was read); one check, and at most one
 * warning, per URL however many bars carry it.
 */
function linksOf({ layout, ctx }: Scene): Map<number, SafeUrl> {
  const urls = new Map<string, SafeUrl | undefined>();
  const out = new Map<number, SafeUrl>();
  const options = {
    securityLevel: ctx.securityLevel ?? 'default',
    linkSchemes: ctx.linkSchemes,
    warn: ctx.warn.bind(ctx),
  } as const;
  layout.bars.forEach((b, i) => {
    if (b.href === undefined) return;
    if (!urls.has(b.href)) urls.set(b.href, checkUrl(b.href, options));
    const url = urls.get(b.href);
    if (url !== undefined) out.set(i, url);
  });
  return out;
}

const classes = (...names: (string | false)[]): string => names.filter(Boolean).join(' ');

/** v12's bar classes: `task`, `milestone`/`vert`, the state and slot, `clickable`. */
function barClass(b: GanttBar): string {
  return classes(
    'task',
    // v12 prefixed `milestone`, then `vert`: `task vert milestone task0`.
    b.kind === 'vert' && 'vert',
    b.milestone && 'milestone',
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
    b.milestone && 'milestoneText',
    b.kind === 'vert' && 'vertText'
  );
}

function drawBar({ w, paint }: Scene, b: GanttBar, i: number): void {
  const p = paint.bars[i]!;
  const o = b.pivot;
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
    // v12's CSS `rotate(45deg) scale(0.8)` about its `transform-origin`, in the element.
    transform:
      b.scale === undefined || o === undefined
        ? undefined
        : transforms(
            rotate(M.milestoneRotation, o.x, o.y),
            translate(o.x, o.y),
            scale(b.scale),
            translate(-o.x, -o.y)
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
  w.open('g');
  layout.bars.forEach((b, i) => {
    if (!links.has(i)) drawBar(scene, b, i);
  });
  layout.bars.forEach((b, i) => {
    if (!links.has(i)) drawLabel(scene, b, i);
  });
  for (const [i, href] of links) {
    const b = layout.bars[i]!;
    w.open('a', { href });
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

/**
 * The section titles, one per name as v12 drew them. A section statement with no title of its
 * own (a repeated name, a section with no row, a blank name) gets an empty
 * `<g class="sectionTitle">` with its `data-ast`, so every section maps to one element
 * (R-PARSE-8).
 */
function drawSections(scene: Scene): void {
  const { w, layout, model } = scene;
  const titled = new Set<string>();
  for (const s of layout.sections) if (s.ast && s.text.lines.length > 0) titled.add(s.ast);
  const markers = model.sections.filter((s) => !titled.has(s.ast));
  if (titled.size === 0 && markers.length === 0) return;
  w.open('g');
  layout.sections.forEach((s, i) => drawSection(scene, s, i));
  for (const s of markers)
    w.leaf('g', { class: 'sectionTitle', 'data-id': s.text, 'data-ast': s.ast });
  w.close();
}

/** v12 `drawToday`: `todayMarker` split on `,` (its lexer rule stops at `;`), checked. */
function drawToday({ w, layout, ctx, paint }: Scene): void {
  const t = layout.today;
  if (!t) return;
  const style = t.style === undefined ? undefined : checkStyle(t.style.split(','), ctx.warn);
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
