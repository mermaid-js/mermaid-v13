/**
 * The gantt custom layout (spec #293 T3, `layoutKind: 'custom'`): schedules the model against
 * `ctx.now` (D274) and places what v12's `ganttRenderer.js` drew, as plain data. Every length
 * comes from `gantt.*` config or the metrics table (pitfall 13).
 */
import { MermaidError } from '@mermaid-js/core';
import { formatDiagnostic, type Diagnostic } from '@mermaid-js/core/parser-kit';
import {
  schedule,
  ScheduleError,
  type Schedule,
  type ScheduleErrorKind,
} from '../schedule/index.ts';
import { barsOf } from './bars.ts';
import { chartOf } from './chart.ts';
import { envOf, type GanttLayoutContext } from './env.ts';
import { axesOf, bandsOf, excludesOf, sectionsOf, titleOf, todayOf } from './parts.ts';
import type { GanttLayout, GanttLayoutModel } from './types.ts';

export const GANTT_UNKNOWN_TASK = 'GANTT_UNKNOWN_TASK';
export const GANTT_BAD_DURATION = 'GANTT_BAD_DURATION';

/** The diagnostic code of each schedule error. */
export const GANTT_ERROR_CODES: Readonly<Record<ScheduleErrorKind, string>> = {
  invalidDate: 'GANTT_INVALID_DATE',
  noStart: 'GANTT_NO_START',
  tooManyFields: 'GANTT_TOO_MANY_FIELDS',
  excluded: 'GANTT_EXCLUDED_ALL',
};

/** Lays out a gantt chart at `ctx.now`. */
export function layoutGantt(model: GanttLayoutModel, ctx: GanttLayoutContext): GanttLayout {
  const now = ctx.now;
  // `RenderOptions.now` is `+(now ?? Date.now())`: an invalid `Date` arrives as NaN (#375).
  if (now === undefined || !Number.isFinite(now)) {
    throw new MermaidError(
      'INTERNAL',
      `A gantt chart needs a valid "now" (RenderOptions.now), got ${String(now)}.`
    );
  }
  const env = envOf(ctx);
  const sched = scheduled(model, now);
  warnings(model, sched, ctx);
  const c = chartOf(env, model, sched);
  const sections = sectionsOf(c);
  const bands = bandsOf(c);
  const excludes = c.domain ? excludesOf(c, ctx.warn) : [];
  const bars = c.domain ? barsOf(c) : [];
  const axes = axesOf(c, ctx.warn, ctx.measurer.metrics(env.fonts.tick));
  const today = todayOf(c, now);
  const title = titleOf(c);
  return {
    width: c.w,
    height: c.h,
    plot: { x: env.leftPadding, width: c.plotWidth },
    ...(c.domain ? { domain: c.domain } : {}),
    rows: c.rows.count,
    compact: env.compact,
    bands,
    bars,
    sections,
    excludes,
    ...axes,
    ...(today ? { today } : {}),
    ...(title ? { title } : {}),
    bounds: c.bounds.box(),
  };
}

/** The schedule, or the render's `SEMANTIC` error at the task that failed (D274). */
function scheduled(model: GanttLayoutModel, now: number): Schedule {
  try {
    return schedule(model, { now });
  } catch (e) {
    if (!(e instanceof ScheduleError)) throw e;
    const range = model.tasks[e.index]?.range;
    if (!range || model.source === undefined) throw new MermaidError('SEMANTIC', e.message);
    const code = GANTT_ERROR_CODES[e.kind];
    const diagnostic: Diagnostic = { severity: 'error', code, message: e.message, range };
    throw new MermaidError('SEMANTIC', formatDiagnostic(model.source, diagnostic), {
      source: model.source,
      offset: range.start,
      length: range.end - range.start,
      diagnostics: [diagnostic],
      cause: e,
    });
  }
}

const quoted = (list: Iterable<string>): string => [...list].map((s) => `"${s}"`).join(', ');

/** D276: one warning each for unknown ids (`after`, `until`, `click`) and bad durations. */
function warnings(model: GanttLayoutModel, sched: Schedule, ctx: GanttLayoutContext): void {
  const known = new Set(model.tasks.map((t) => t.id));
  // v12 kept ids on a plain object, where `__proto__` is never stored.
  known.delete('__proto__');
  const unknown = new Set(sched.unknownIds);
  for (const click of model.clicks) for (const id of click.ids) if (!known.has(id)) unknown.add(id);
  if (unknown.size > 0) {
    ctx.warn({
      code: GANTT_UNKNOWN_TASK,
      message: `No task has the id ${quoted(unknown)}: "after" then starts and "until" ends at midnight today, and a click does nothing. Milestones need an id and a duration, e.g. "Milestone :milestone, m1, 2023-01-01, 0d".`,
    });
  }
  if (sched.badDurations.length > 0) {
    ctx.warn({
      code: GANTT_BAD_DURATION,
      message: `${quoted(sched.badDurations)}: neither a date in the dateFormat nor a duration such as "3d", so the task gets no duration.`,
    });
  }
}
