/**
 * The gantt custom layout (spec #293 T3, `layoutKind: 'custom'`): schedules the model against
 * `ctx.now` (D274) and places what v12's `ganttRenderer.js` drew, as plain data. Every length
 * comes from `gantt.*` config or the metrics table (pitfall 13).
 */
import { MermaidError } from '@mermaid-js/core';
import { formatDiagnostic, type Diagnostic } from '@mermaid-js/core/parser-kit';
import { clickTargets } from '../ids.ts';
import { Steps } from '../steps.ts';
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
import type { GanttModel } from '../model.ts';
import type { GanttLayout } from './types.ts';

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
export function layoutGantt(model: GanttModel, ctx: GanttLayoutContext): GanttLayout {
  const now = ctx.now;
  // `RenderOptions.now` is `+(now ?? Date.now())`: an invalid `Date` arrives as NaN (#375).
  if (now === undefined || !Number.isFinite(now)) {
    throw new MermaidError(
      'INTERNAL',
      `A gantt chart needs a valid "now" (RenderOptions.now), got ${String(now)}.`
    );
  }
  const env = envOf(ctx);
  // One work counter for the schedule and the exclude ranges (D542).
  const steps = new Steps(ctx.limits?.maxLayoutWork);
  const plan = scheduled(model, now, steps);
  warnings(model, plan, ctx);
  const c = chartOf(env, model, plan);
  const sections = sectionsOf(c);
  const bands = bandsOf(c);
  const excludes = c.domain ? excludesOf(c, ctx.warn, steps) : [];
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
    fontSize: env.fontSize,
    sectionFontSize: env.sectionFontSize,
    bands,
    bars,
    sections,
    excludes,
    ...axes,
    ...(today ? { today } : {}),
    ...(title ? { title } : {}),
    bounds: c.bounds.rect(),
  };
}

/** The schedule, or the render's `SEMANTIC` error at the task that failed (D274). */
function scheduled(model: GanttModel, now: number, steps: Steps): Schedule {
  try {
    return schedule(model, { now, steps });
  } catch (e) {
    if (!(e instanceof ScheduleError)) throw e;
    const range = model.tasks[e.index]?.dataRange;
    if (!range) throw new MermaidError('SEMANTIC', e.message);
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
function warnings(model: GanttModel, plan: Schedule, ctx: GanttLayoutContext): void {
  const unknown = new Set(plan.unknownIds);
  // A click names the latest task with the id written before it, or nothing (`ids.ts`).
  clickTargets(model.tasks, model.clicks).forEach((targets, i) =>
    targets.forEach((at, k) => {
      if (at === undefined) unknown.add(model.clicks[i]!.ids[k]!);
    })
  );
  if (unknown.size > 0) {
    ctx.warn({
      code: GANTT_UNKNOWN_TASK,
      message: `No task has the id ${quoted(unknown)} (for a click: none written before it): "after" then starts and "until" ends at midnight today, and a click does nothing. Milestones need an id and a duration, e.g. "Milestone :milestone, m1, 2023-01-01, 0d".`,
    });
  }
  if (plan.badDurations.length > 0) {
    ctx.warn({
      code: GANTT_BAD_DURATION,
      message: `${quoted(plan.badDurations)}: neither a date in the dateFormat nor a duration such as "3d", so the task gets no duration.`,
    });
  }
}
