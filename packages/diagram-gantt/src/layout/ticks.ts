/**
 * The time axis ticks (v12 `makeGrid`): `tickInterval` with d3's `every` rule, else d3's
 * automatic ticks, both from D1's `axis.ts`; `axisFormat` labels.
 */
import { autoTicks, intervalTicks, timeFormat } from '../dates/index.ts';
import type { Env } from './env.ts';

/** `tickInterval` as v12's `makeGrid` reads it (no `year`). */
const RE_TICK_INTERVAL = /^([1-9]\d*)(millisecond|second|minute|hour|day|week|month)$/;

/** v12 `MAX_TICK_COUNT` was passed: the ticks fell back to d3's automatic ones. */
export const GANTT_TICK_INTERVAL_IGNORED = 'GANTT_TICK_INTERVAL_IGNORED';

export interface TickSet {
  readonly times: readonly number[];
  /** Set when `tickInterval` asked for more than v12's limit. */
  readonly tooMany?: { readonly interval: string; readonly estimate: number };
}

/**
 * The tick times for the domain. `interval` is the statement's value, else `gantt.tickInterval`;
 * `weekday` the statement's, else `gantt.weekday`, else Sunday (D279).
 */
export function ticksOf(
  env: Env,
  start: number,
  end: number,
  interval: string | undefined,
  weekday: string
): TickSet {
  const auto = (): number[] => {
    // d3 gives a one-instant domain a 1 ms step, so its one tick is the instant (v12 draws it),
    // and a reversed domain (a start after every end) its ticks in reverse.
    if (start > end) return autoTicks(end, start, env.m.tickCount).reverse();
    return autoTicks(start, end, env.m.tickCount);
  };
  const match = interval === undefined ? null : RE_TICK_INTERVAL.exec(interval);
  if (!match) return { times: auto() };
  const every = Number(match[1]);
  const unit = match[2]!;
  // v12 `getEstimatedTickCount`: Infinity for a reversed domain.
  const estimate =
    start > end ? Infinity : Math.ceil((end - start) / (env.m.tickUnitMs[unit]! * every));
  if (estimate <= env.m.maxTicks) {
    const times = intervalTicks(`${every}${unit}`, weekday, start, end, env.m.maxTicks);
    if (times) return { times };
  }
  return { times: auto(), tooMany: { interval: `${every}${unit}`, estimate } };
}

/** An `axisFormat` label; d3 formats in local time. */
export const tickLabel = (format: string, time: number): string =>
  timeFormat(format, new Date(time));
