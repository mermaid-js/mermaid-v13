import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { envOf, type Env } from './env.ts';
import { tickLabel, ticksOf } from './ticks.ts';

// `ticksOf` on its own: the time-axis ticks v12's `makeGrid` draws through d3. Dates are local
// and DST-free, so each case holds in both gantt zones.
let env: Env;
beforeAll(async () => {
  env = envOf({
    config: { gantt: {} } as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(await loadTheme('default')),
    warn: () => undefined,
  });
});

const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

describe('ticksOf', () => {
  it('gives a one-instant domain one tick at that instant, as v12 draws (#774)', () => {
    // d3's tick step for a zero-length domain is 1 ms, so its one tick is the instant itself.
    const t = at(2024, 1, 1);
    expect(ticksOf(env, t, t, undefined, 'sunday')).toEqual({ times: [t] });
    expect(tickLabel('%Y-%m-%d', t)).toBe('2024-01-01');
  });

  it('keeps the tick on an instant that is not on a day boundary', () => {
    const t = at(2025, 7, 4, 20, 30);
    expect(ticksOf(env, t, t, undefined, 'sunday').times).toEqual([t]);
  });

  it('gives a one-instant domain a tickInterval tick only when the instant is on it', () => {
    // d3's `interval.range(t, t + 1)`: midnight is on `1day`, 20:30 is not.
    const midnight = at(2024, 1, 1);
    expect(ticksOf(env, midnight, midnight, '1day', 'sunday')).toEqual({ times: [midnight] });
    const evening = at(2024, 1, 1, 20, 30);
    expect(ticksOf(env, evening, evening, '1day', 'sunday')).toEqual({ times: [] });
  });

  it('still gives a longer domain d3 automatic ticks, and a reversed one in reverse', () => {
    const start = at(2014, 1, 1);
    const end = at(2014, 1, 5);
    const forward = ticksOf(env, start, end, undefined, 'sunday').times;
    // d3 picks 12-hour ticks for 4 days at 10 ticks.
    expect(forward).toHaveLength(9);
    expect([forward[0], forward.at(-1)]).toEqual([start, end]);
    expect(ticksOf(env, end, start, undefined, 'sunday').times).toEqual([...forward].reverse());
  });
});
