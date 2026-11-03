import { describe, expect, it } from 'vitest';
import { compareRounds, spreadRounds } from './compare.ts';
import type { Fixture } from './fixtures.ts';
import type { Session } from './interleave.ts';
import type { RendererId, RendererRun } from './report.ts';
import { emptyStages } from './report.ts';

const fixture = (id: string): Fixture => ({
  id,
  set: 'corpus',
  type: 'flowchart',
  group: 'g',
  tier: 'tiny',
  features: [],
  bytes: 1,
  source: 'graph TD\nA-->B',
});
const diagrams = ['a', 'b'].map((id) => ({ diagram: { id, label: id }, fixture: fixture(id) }));

/** Fake renderers: each open is a fresh session that records what it measured. */
function harness(fail: RendererId[] = []) {
  const opens: string[] = [];
  const calls: string[] = [];
  const open = (r: RendererId): Promise<Session | RendererRun> => {
    opens.push(r);
    const run: RendererRun = {
      renderer: r,
      version: '1',
      status: fail.includes(r) ? 'init-error' : 'ready',
      ...(fail.includes(r) && { error: 'no' }),
      readyAtMs: null,
      initMs: null,
      size: null,
      results: [],
    };
    if (fail.includes(r)) return Promise.resolve(run);
    let closed = false;
    return Promise.resolve({
      renderer: r,
      run,
      measure: (f) => {
        if (closed) throw new Error('measured after close');
        calls.push(`${f.id}:${r}`);
        return Promise.resolve({
          id: f.id,
          set: f.set,
          status: 'ok',
          firstMs: 1,
          warmMs: 1,
          p95Ms: 1,
          batch: 1,
          samples: 1,
          stages: emptyStages(),
        });
      },
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });
  };
  return { opens, calls, open };
}

describe('spreadRounds', () => {
  it('spreads a few rounds evenly over all of them', () => {
    expect([...spreadRounds(20, 3)]).toEqual([0, 6, 13]);
    expect([...spreadRounds(4, 10)]).toEqual([0, 1, 2, 3]);
    expect(spreadRounds(20, 0).size).toBe(0);
  });
});

describe('compareRounds', () => {
  it('opens fresh sessions every round and runs mermaid@12 only in some', async () => {
    const h = harness();
    const env = await compareRounds({
      renderers: ['v13', 'v13-base', 'v12-frozen'],
      diagrams,
      rounds: 4,
      someRounds: 2,
      open: h.open,
      log: () => {},
      env: 'test',
    });
    expect(h.opens.filter((r) => r === 'v13')).toHaveLength(4);
    expect(h.opens.filter((r) => r === 'v12-frozen')).toHaveLength(2);
    const v12 = env.warm.a!['v12-frozen']!;
    expect(v12.filter((x) => x !== null)).toHaveLength(2);
    expect(v12[0]).not.toBeNull();
    expect(v12[1]).toBeNull();
    expect(env.renderers.map((r) => r.renderer)).toEqual(['v13', 'v13-base', 'v12-frozen']);
  });

  it('alternates renderers per diagram, rotating with the round and the diagram', async () => {
    const h = harness();
    await compareRounds({
      renderers: ['v13', 'v13-base'],
      diagrams,
      rounds: 2,
      someRounds: 0,
      open: h.open,
      log: () => {},
      env: 'test',
    });
    // Who goes first changes with both the diagram and the round, so neither is always first.
    expect(h.calls).toEqual([
      'a:v13',
      'a:v13-base',
      'b:v13-base',
      'b:v13',
      'a:v13-base',
      'a:v13',
      'b:v13',
      'b:v13-base',
    ]);
  });

  it('records a renderer that did not start, and keeps measuring the others', async () => {
    const h = harness(['pele']);
    const env = await compareRounds({
      renderers: ['v13', 'pele'],
      diagrams,
      rounds: 2,
      someRounds: 0,
      open: h.open,
      log: () => {},
      env: 'test',
    });
    expect(env.renderers.find((r) => r.renderer === 'pele')?.error).toBe('no');
    expect(env.warm.a!.pele).toEqual([null, null]);
    expect(env.warm.a!.v13!.every((x) => x !== null)).toBe(true);
  });
});
