/**
 * The gantt custom layout (spec #293 T3, `layoutKind: 'custom'`): schedules the model against
 * `ctx.now` (D274) and places what v12's `ganttRenderer.js` drew, as plain data. Every length
 * comes from `gantt.*` config or the metrics table (pitfall 13).
 */
import { MermaidError } from '@mermaid-js/core';
import { formatDiagnostic, type Diagnostic } from '@mermaid-js/core/parser-kit';
import { clickTargets, NEVER_STORED } from '../ids.ts';
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

type Reference = 'after' | 'until' | 'click';

/** What an unknown reference does, per statement (v12 fell back to midnight today). */
const CONSEQUENCE: Readonly<Record<Reference, { task: string; reserved: string }>> = {
  after: {
    task: 'the task starts at midnight today',
    reserved: 'an "after" naming it starts at midnight today',
  },
  until: {
    task: 'the task ends at midnight today',
    reserved: 'an "until" naming it ends at midnight today',
  },
  click: { task: 'the click does nothing', reserved: 'a click naming it does nothing' },
};

const HINT_MILESTONE =
  'A milestone needs an id and a duration, e.g. "Milestone :milestone, m1, 2023-01-01, 0d".';

/**
 * The unknown ids by statement, in first-seen order, and whether the milestone hint applies: a
 * milestone named one, or one is the id a milestone wrote where its duration goes (#4121). The
 * reserved id is never stored, so it never calls for the hint.
 */
function unknownByKind(
  model: GanttModel,
  plan: Schedule
): { ids: Map<Reference, Set<string>>; milestone: boolean } {
  const ids = new Map<Reference, Set<string>>();
  const add = (kind: Reference, id: string): void => {
    const set = ids.get(kind) ?? new Set<string>();
    ids.set(kind, set.add(id));
  };
  plan.unknownRefs.forEach((r) => add(r.kind, r.id));
  // A click names the latest task with the id written before it, or nothing (`ids.ts`).
  clickTargets(model.tasks, model.clicks).forEach((targets, i) =>
    targets.forEach((at, k) => {
      if (at === undefined) add('click', model.clicks[i]!.ids[k]!);
    })
  );
  const written = new Set(plan.milestoneBadDurations);
  const milestone =
    plan.unknownRefs.some((r) => r.id !== NEVER_STORED && r.milestone) ||
    [...ids.values()].some((named) =>
      [...named].some((id) => id !== NEVER_STORED && written.has(id))
    );
  return { ids, milestone };
}

/** The clause for the ids one statement named that no task has, if any. */
function unknownClause(kind: Reference, named: ReadonlySet<string>): string | undefined {
  const plain = [...named].filter((id) => id !== NEVER_STORED);
  if (plain.length === 0) return undefined;
  const who =
    kind === 'click'
      ? `No task written before the click has the id ${quoted(plain)}`
      : `No task has the id ${quoted(plain)} (named by "${kind}")`;
  return `${who}: ${CONSEQUENCE[kind].task}.`;
}

/** The clause for the reserved id, naming what each statement that used it does. */
function reservedClause(kinds: readonly Reference[]): string | undefined {
  if (kinds.length === 0) return undefined;
  const effects = kinds.map((kind) => CONSEQUENCE[kind].reserved);
  const last = effects.pop()!;
  const list =
    effects.length === 0
      ? last
      : `${effects.join(', ')}${effects.length > 1 ? ',' : ''} and ${last}`;
  return `The id "${NEVER_STORED}" is reserved and cannot be referenced: ${list}.`;
}

/** D727: the text of the one `GANTT_UNKNOWN_TASK` warning: a clause per statement involved. */
function unknownTaskMessage(model: GanttModel, plan: Schedule): string | undefined {
  const { ids, milestone } = unknownByKind(model, plan);
  const kinds = (['after', 'until', 'click'] as const).filter((kind) => ids.has(kind));
  const clauses = [
    ...kinds.map((kind) => unknownClause(kind, ids.get(kind)!)),
    reservedClause(kinds.filter((kind) => ids.get(kind)!.has(NEVER_STORED))),
  ].filter((c): c is string => c !== undefined);
  if (clauses.length === 0) return undefined;
  if (milestone) clauses.push(HINT_MILESTONE);
  return clauses.join(' ');
}

/** D276, D727: one warning for unknown ids (`after`, `until`, `click`), one for bad durations. */
function warnings(model: GanttModel, plan: Schedule, ctx: GanttLayoutContext): void {
  const message = unknownTaskMessage(model, plan);
  if (message !== undefined) ctx.warn({ code: GANTT_UNKNOWN_TASK, message });
  if (plan.badDurations.length > 0) {
    ctx.warn({
      code: GANTT_BAD_DURATION,
      message: `${quoted(plan.badDurations)}: neither a date in the dateFormat nor a duration such as "3d", so the task gets no duration.`,
    });
  }
}
