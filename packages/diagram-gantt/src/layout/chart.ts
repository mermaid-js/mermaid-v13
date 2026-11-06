/**
 * One chart's frame: what every part of the layout reads (v12 `draw`'s locals): the size, the
 * rows, the section colour slots, the time scale and the bounds being grown.
 */
import type { Schedule, ScheduledTask } from '../schedule/index.ts';
import { Bounds } from './bounds.ts';
import type { Env } from './env.ts';
import { rowsOf, type Rows } from './rows.ts';
import type { GanttLayoutModel } from './types.ts';

export const isVert = (t: ScheduledTask): boolean => t.task.tags.includes('vert');
export const resolved = (t: ScheduledTask): boolean => t.start !== undefined && t.end !== undefined;

export interface Domain {
  readonly start: number;
  readonly end: number;
}

export interface Chart {
  readonly env: Env;
  readonly model: GanttLayoutModel;
  readonly plan: Schedule;
  /** v12 `w` and `h`. */
  readonly w: number;
  readonly h: number;
  /** A row's pitch: `barHeight + barGap`. */
  readonly gap: number;
  readonly plotWidth: number;
  readonly rows: Rows;
  /** Tasks that take a row (not `vert`), in source order. */
  readonly plain: readonly ScheduledTask[];
  readonly domain?: Domain;
  /** The section colour slot of a section name. */
  slot(section: string): number;
  /** A time on the plot, from 0 (v12 `timeScale`). */
  scale(t: number): number;
  readonly bounds: Bounds;
}

/**
 * v12 `scaleTime().domain([min start, max end])` over every task, `vert` included; undefined
 * when no task with a row resolved (D277: nothing to schedule).
 */
function domainOf(tasks: readonly ScheduledTask[]): Domain | undefined {
  if (!tasks.some((t) => !isVert(t) && resolved(t))) return undefined;
  let start = Infinity;
  let end = -Infinity;
  for (const t of tasks) {
    if (t.start !== undefined) start = Math.min(start, t.start);
    if (t.end !== undefined) end = Math.max(end, t.end);
  }
  return { start, end };
}

/** A linear time scale onto [0, `width`], rounded (d3 `scaleTime().rangeRound`). */
function scaleOf(domain: Domain | undefined, width: number): (t: number) => number {
  const span = domain ? domain.end - domain.start : 0;
  if (!domain || span === 0) return () => Math.round(width / 2);
  // d3 maps every value of a one-instant domain to the middle of the range.
  return (t) => Math.round(width * ((t - domain.start) / span));
}

export function chartOf(env: Env, model: GanttLayoutModel, plan: Schedule): Chart {
  const rows = rowsOf(plan.tasks, env.compact);
  const gap = env.barHeight + env.barGap;
  const w = env.width;
  const h = 2 * env.topPadding + rows.count * gap;
  const plotWidth = w - env.leftPadding - env.rightPadding;
  const plain = plan.tasks.filter((t) => !isVert(t));
  // Unique sections of the tasks with rows, in order (v12 `categories`).
  const categories = [...new Set(plain.map((t) => t.task.section))];
  const domain = domainOf(plan.tasks);
  return {
    env,
    model,
    plan,
    w,
    h,
    gap,
    plotWidth,
    rows,
    plain,
    ...(domain ? { domain } : {}),
    slot(section) {
      const i = categories.indexOf(section);
      return i < 0 ? 0 : i % env.numberSectionStyles;
    },
    scale: scaleOf(domain, plotWidth),
    bounds: new Bounds().rect({ x: 0, y: 0, width: w, height: h }),
  };
}

/** v12's `taskArray.sort(taskCompare)`: by start, stable; unresolved tasks compare equal. */
export function byStart(tasks: readonly ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort((a, b) =>
    a.start === undefined || b.start === undefined ? 0 : a.start - b.start
  );
}
