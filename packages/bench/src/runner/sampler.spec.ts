import { describe, expect, it } from 'vitest';
import type { Adapter } from './adapters.ts';
import { sample } from './sampler.ts';

const adapter: Adapter = { init: () => Promise.resolve(), render: () => Promise.resolve('<svg/>') };
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

describe('sample', () => {
  it('batches renders faster than 2 ms so each sample lasts at least that long', async () => {
    const reply = await sample(
      { renderOnce: () => Promise.resolve(0.1), adapter, errorText },
      'flowchart LR\n A --> B',
      3,
      1000
    );
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.firstMs).toBe(0.1);
    expect(reply.batch).toBe(20);
    expect(reply.samples).toHaveLength(3);
  });

  it('stops warm samples once the budget is spent, after at least one', async () => {
    const reply = await sample(
      { renderOnce: () => new Promise((r) => setTimeout(() => r(5), 5)), adapter, errorText },
      's',
      10,
      1
    );
    expect(reply.ok && reply.samples.length).toBe(1);
  });

  it('turns a throwing render into an error reply and always cleans up', async () => {
    let cleaned = 0;
    const reply = await sample(
      {
        renderOnce: () => Promise.reject(new Error('Expected a node id')),
        adapter,
        errorText,
        cleanup: () => cleaned++,
      },
      's',
      3,
      1000
    );
    expect(reply).toEqual({ ok: false, error: 'Expected a node id' });
    expect(cleaned).toBe(1);
  });

  it('records per-render stage times from adapters that have them', async () => {
    let n = 0;
    const staged: Adapter = { ...adapter, takeStages: () => (n++ % 2 ? { parse: 0.4 } : {}) };
    const reply = await sample(
      { renderOnce: () => Promise.resolve(3), adapter: staged, errorText },
      's',
      2,
      1000
    );
    expect(reply.ok && reply.stageSamples.parse).toEqual([0.4, 0.4]);
  });

  it('keeps sampling until the warm samples add up to minTotalMs, past reps and the budget', async () => {
    const slow = () => new Promise<number>((r) => setTimeout(() => r(3), 3));
    const reply = await sample({ renderOnce: slow, adapter, errorText }, 's', 2, 1, 60);
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    // reps is 2 and the budget 1 ms, but sampling went on until 60 ms of samples.
    expect(reply.samples.length).toBeGreaterThan(2);
    expect(reply.samples.reduce((a, x) => a + x, 0)).toBeGreaterThanOrEqual(60);
  });

  it('batches renders up to minSampleMs per warm sample', async () => {
    const reply = await sample(
      { renderOnce: () => Promise.resolve(0.1), adapter, errorText },
      's',
      1,
      1000,
      0,
      20
    );
    expect(reply.ok && reply.batch).toBe(200);
  });
});
