/**
 * The chart's other parts, each one of v12's drawing functions: row bands and section titles
 * (`drawRects`, `vertLabels`), exclude ranges (`drawExcludeDays`), the axes (`makeGrid`), the
 * today line (`drawToday`) and the title.
 */
import type { Warning } from '@mermaid-js/core';
import { add, addDays } from '../dates/index.ts';
import { isExcluded, WEEKEND_START_DAY } from '../schedule/index.ts';
import { byStart, type Chart, type Domain } from './chart.ts';
import { GANTT_TICK_INTERVAL_IGNORED, tickLabel, ticksOf } from './ticks.ts';
import type {
  GanttAxis,
  GanttBand,
  GanttSectionLabel,
  GanttTick,
  GanttToday,
  PlacedText,
  Rect,
} from './types.ts';

export const GANTT_EXCLUDES_NOT_DRAWN = 'GANTT_EXCLUDES_NOT_DRAWN';

type Warn = (w: Warning) => void;

/** One band per row, coloured by the first task (by start) in it (v12 `uniqueTasks`). */
export function bandsOf(c: Chart): GanttBand[] {
  const { env } = c;
  const seen = new Set<number>();
  const out: GanttBand[] = [];
  for (const t of byStart(c.plain)) {
    const row = c.rows.of.get(t.index);
    if (row === undefined || seen.has(row)) continue;
    seen.add(row);
    const band: GanttBand = {
      x: 0,
      y: row * c.gap + env.topPadding - env.m.bandOffset,
      width: c.w - env.rightPadding * env.m.bandRightTrim,
      height: c.gap,
      slot: c.slot(t.task.section),
    };
    c.bounds.rect(band);
    out.push(band);
  }
  return out;
}

/** v12 `vertLabels`: one title per section name, centred on its rows. */
export function sectionsOf(c: Chart): GanttSectionLabel[] {
  const { env } = c;
  let before = 0;
  return c.rows.sections.map(([name, n]) => {
    const y = (n * c.gap) / 2 + before * c.gap + env.topPadding;
    before += n;
    const text = env.sectionLabel(name);
    const lineHeight = env.m.sectionLineEm * env.fonts.section.size;
    const ast = c.model.sections.find((s) => s.text === name)?.ast;
    // Each line is centred on its own baseline (`alignment-baseline: central`), 1em apart.
    const pitch = (Math.max(1, text.lines.length) - 1) * lineHeight;
    const top = y - pitch / 2 - text.lineHeight / 2;
    c.bounds.rect({
      x: env.m.sectionX,
      y: top,
      width: text.width,
      height: pitch + text.lineHeight,
    });
    return {
      section: name,
      ...(ast !== undefined ? { ast } : {}),
      slot: c.slot(name),
      rows: n,
      x: env.m.sectionX,
      y,
      text,
      lineHeight,
    };
  });
}

/** The span of every task's times (v12 `drawExcludeDays`' own min and max). */
function spanOf(c: Chart): Domain | undefined {
  let start: number | undefined;
  let end: number | undefined;
  for (const t of c.plan.tasks) {
    if (t.start !== undefined && (start === undefined || t.start < start)) start = t.start;
    if (t.end !== undefined && (end === undefined || t.end > end)) end = t.end;
  }
  return start === undefined || end === undefined ? undefined : { start, end };
}

/** v12 `drawExcludeDays`: runs of excluded days over the tasks, none past five years. */
export function excludesOf(c: Chart, warn: Warn): Rect[] {
  const { env, model } = c;
  if (model.excludes.length === 0 && model.includes.length === 0) return [];
  const span = spanOf(c);
  if (!span) return [];
  if (add(new Date(span.start), env.m.excludeSpanMonths, 'M').getTime() <= span.end) {
    warn({
      code: GANTT_EXCLUDES_NOT_DRAWN,
      message:
        'The chart spans more than 5 years, so excluded days are not drawn (they still push task ends out).',
    });
    return [];
  }
  const includes = new Set(model.includes);
  const excludes = new Set(model.excludes);
  const weekend = WEEKEND_START_DAY[model.weekend];
  const x = (t: number): number => c.scale(t) + env.leftPadding;
  const y = env.gridLineStartPadding;
  const height = c.h - env.topPadding - env.gridLineStartPadding;
  const out: Rect[] = [];
  let run: [Date, Date] | undefined;
  for (let d = new Date(span.start); d.getTime() <= span.end; d = addDays(d, 1)) {
    if (isExcluded(d, model.dateFormat, includes, excludes, weekend)) {
      run = [run ? run[0] : d, d];
      continue;
    }
    if (!run) continue;
    // v12 pushes a run only when a day after it is not excluded: a run open at the end is dropped.
    const from = new Date(run[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(run[1]);
    to.setHours(23, 59, 59, 999);
    const r = { x: x(from.getTime()), y, width: x(to.getTime()) - x(from.getTime()), height };
    c.bounds.rect(r);
    out.push(r);
    run = undefined;
  }
  return out;
}

/** v12 `makeGrid`'s format: the statement, `%d` for `dateFormat D`, then config, then `%Y-%m-%d`. */
function axisFormatOf(c: Chart): string {
  if (c.model.axisFormat) return c.model.axisFormat;
  if (c.model.dateFormat === 'D') return '%d';
  return c.env.axisFormat ?? c.env.m.defaults.axisFormat;
}

function ticksFor(c: Chart, warn: Warn): GanttTick[] {
  const { env, model, domain } = c;
  if (!domain) return [];
  const weekday = model.weekday ?? env.weekday ?? env.m.defaults.weekday;
  const interval = model.tickInterval || env.tickInterval;
  const ticks = ticksOf(env, domain.start, domain.end, interval, weekday);
  if (ticks.tooMany) {
    warn({
      code: GANTT_TICK_INTERVAL_IGNORED,
      message: `tickInterval ${ticks.tooMany.interval} would draw more than ${env.m.maxTicks} ticks (about ${ticks.tooMany.estimate}), so automatic ticks are drawn instead.`,
    });
  }
  const format = axisFormatOf(c);
  return ticks.times.map((time) => {
    const label = tickLabel(format, time);
    const x = c.scale(time) + env.leftPadding;
    return { time, x, label, width: env.label(label, env.fonts.tick).width };
  });
}

/** The tick lines and labels as drawn, for the bounds. */
function axisBounds(c: Chart, axis: GanttAxis, ascent: number, lineHeight: number): void {
  for (const t of axis.ticks) {
    c.bounds.point(t.x, axis.y1).point(t.x, axis.y2);
    c.bounds.rect({
      x: t.x - t.width / 2,
      y: axis.labelY - ascent,
      width: t.width,
      height: lineHeight,
    });
  }
}

/**
 * The bottom axis at `h − 50` (labels `dy 1em` below d3's tick padding), and the top axis on
 * `topPadding` when `topAxis` is set (statement, D273, or config). Tick lines span the grid:
 * `tickSize(−h + topPadding + gridLineStartPadding)`.
 */
export function axesOf(
  c: Chart,
  warn: Warn,
  metrics: { ascent: number; lineHeight: number }
): { bottomAxis: GanttAxis; topAxis?: GanttAxis } {
  const { env } = c;
  const { m } = env;
  const ticks = ticksFor(c, warn);
  const y = c.h - m.axisBottomGap;
  const grid = c.h - env.topPadding - env.gridLineStartPadding;
  const bottomAxis: GanttAxis = {
    y,
    y1: y,
    y2: ticks.length > 0 ? y - grid : y,
    labelY: y + m.tickPadding + m.tickLabelEm * env.fonts.tick.size,
    ticks,
  };
  axisBounds(c, bottomAxis, metrics.ascent, metrics.lineHeight);
  if (!env.topAxis && !c.model.topAxis) return { bottomAxis };
  const top = env.topPadding;
  const topAxis: GanttAxis = {
    y: top,
    y1: top,
    y2: ticks.length > 0 ? top + grid : top,
    labelY: top - m.tickPadding,
    ticks,
  };
  axisBounds(c, topAxis, metrics.ascent, metrics.lineHeight);
  return { bottomAxis, topAxis };
}

/** v12 `drawToday`, drawn only when `now` is in the domain (D275). */
export function todayOf(c: Chart, now: number): GanttToday | undefined {
  const { domain, env } = c;
  const marker = c.model.todayMarker;
  if (!domain || marker === 'off' || now < domain.start || now > domain.end) return undefined;
  const today: GanttToday = {
    x: c.scale(now) + env.leftPadding,
    y1: env.titleTopMargin,
    y2: c.h - env.titleTopMargin,
    ...(marker !== '' ? { style: marker } : {}),
  };
  c.bounds.point(today.x, today.y1).point(today.x, today.y2);
  return today;
}

/** The title at `w / 2` on `titleTopMargin`; none when empty (v12 drew an empty `<text>`). */
export function titleOf(c: Chart): PlacedText | undefined {
  const raw = c.model.title;
  if (raw === undefined || raw.trim() === '') return undefined;
  const text = c.env.label(raw, c.env.fonts.title);
  const title: PlacedText = { x: c.w / 2, y: c.env.titleTopMargin, anchor: 'middle', text };
  c.bounds.text(title);
  return title;
}
