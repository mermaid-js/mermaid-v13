import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Stage } from './index.ts';

// The module reads the bench flag once, when it loads: each test loads it with the flag set.
async function benchTiming() {
  vi.stubGlobal('__MERMAID_BENCH__', true);
  vi.resetModules();
  const timing = await import('./index.ts');
  let now = 0;
  const recorded: [Stage, number][] = [];
  timing.installStageClock({ now: () => now, record: (stage, ms) => recorded.push([stage, ms]) });
  return { ...timing, recorded, at: (t: number) => (now = t) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stage timing in a bench build', () => {
  it('records each stage from its start to its end', async () => {
    const { stageStart, stageEnd, recorded, at } = await benchTiming();
    at(10);
    const t = stageStart();
    at(14);
    stageEnd('parse', t);
    expect(recorded).toEqual([['parse', 4]]);
  });

  it('leaves a stage that runs inside another out of the outer one’s time (D203)', async () => {
    const { stageStart, stageEnd, recorded, at } = await benchTiming();
    at(0);
    const layout = stageStart();
    at(1);
    const measure = stageStart();
    at(4);
    stageEnd('measure', measure);
    at(10);
    stageEnd('layout', layout);
    expect(recorded).toEqual([
      ['measure', 3],
      ['layout', 7],
    ]);
    at(20);
    const serialise = stageStart();
    at(22);
    stageEnd('serialise', serialise);
    expect(recorded.at(-1)).toEqual(['serialise', 2]);
  });

  it('records nothing outside a bench build', async () => {
    vi.resetModules();
    const timing = await import('./index.ts');
    const recorded: unknown[] = [];
    timing.installStageClock({ now: () => 1, record: (...a) => recorded.push(a) });
    timing.stageEnd('parse', timing.stageStart());
    expect(timing.STAGE_TIMING).toBe(false);
    expect(recorded).toEqual([]);
  });
});
