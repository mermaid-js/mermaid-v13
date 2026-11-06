import { describe, expect, it } from 'vitest';
import type { Fixture } from './fixtures.ts';
import type { Session } from './interleave.ts';
import { interleave, rotation, runAll } from './interleave.ts';
import type { DiagramResult, RendererId, RendererRun } from './report.ts';
import { emptyStages } from './report.ts';

const fixture = (id: string): Fixture => ({
  id,
  set: 'corpus',
  type: 'flowchart',
  group: 'g',
  tier: 'tiny',
  features: [],
  bytes: 10,
  source: 'graph TD\nA-->B',
});

const emptyRun = (renderer: RendererId, status: RendererRun['status'] = 'ready'): RendererRun => ({
  renderer,
  version: '0',
  status,
  readyAtMs: null,
  initMs: null,
  size: null,
  results: [],
});

/** A fake renderer that records the global order in which fixtures were measured on it. */
function fakeSession(renderer: RendererId, calls: string[], closed: string[]): Session {
  return {
    renderer,
    run: emptyRun(renderer),
    measure: (f): Promise<DiagramResult> => {
      calls.push(`${f.id}:${renderer}`);
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
      closed.push(renderer);
      return Promise.resolve();
    },
  };
}

describe('rotation', () => {
  it('starts each fixture on the next renderer', () => {
    expect(rotation(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c']);
    expect(rotation(['a', 'b', 'c'], 1)).toEqual(['b', 'c', 'a']);
    expect(rotation(['a', 'b', 'c'], 5)).toEqual(['c', 'a', 'b']);
    expect(rotation([], 3)).toEqual([]);
  });
});

describe('interleave', () => {
  it('measures each fixture on every renderer before the next fixture, rotating the order', async () => {
    const calls: string[] = [];
    const closed: string[] = [];
    const sessions = (['v13', 'v13-base', 'pele'] as const).map((r) =>
      fakeSession(r, calls, closed)
    );
    const runs = await interleave(sessions, ['x', 'y', 'z'].map(fixture), () => {}, 'test');
    expect(calls).toEqual([
      'x:v13',
      'x:v13-base',
      'x:pele',
      'y:v13-base',
      'y:pele',
      'y:v13',
      'z:pele',
      'z:v13',
      'z:v13-base',
    ]);
    // Each run keeps its results in fixture order, and runs keep renderer order.
    expect(runs.map((r) => r.renderer)).toEqual(['v13', 'v13-base', 'pele']);
    for (const r of runs) expect(r.results.map((x) => x.id)).toEqual(['x', 'y', 'z']);
    expect(closed.sort()).toEqual(['pele', 'v13', 'v13-base']);
  });

  it('runs finish on the open sessions after the last fixture, before closing them', async () => {
    const calls: string[] = [];
    const closed: string[] = [];
    const sessions = (['v13', 'pele'] as const).map((r) => fakeSession(r, calls, closed));
    let seen: string[] = [];
    await interleave(
      sessions,
      [fixture('x')],
      () => {},
      'test',
      async (open) => {
        seen = open.map((s) => s.renderer);
        expect(closed).toEqual([]);
        await open[0]!.measure(fixture('again'));
      }
    );
    expect(seen).toEqual(['v13', 'pele']);
    expect(calls).toEqual(['x:v13', 'x:pele', 'again:v13']);
    expect(closed.sort()).toEqual(['pele', 'v13']);
  });

  it('closes every session when a measurement throws', async () => {
    const closed: string[] = [];
    const good = fakeSession('v13', [], closed);
    const bad: Session = {
      ...fakeSession('pele', [], closed),
      measure: () => Promise.reject(new Error('page crashed')),
    };
    await expect(interleave([good, bad], [fixture('x')], () => {}, 'test')).rejects.toThrow(
      'page crashed'
    );
    expect(closed.sort()).toEqual(['pele', 'v13']);
  });
});

describe('runAll', () => {
  it('keeps renderers that could not start in place, and runs the others alternating', async () => {
    const calls: string[] = [];
    const runs = await runAll(
      ['v13', 'v13-base', 'pele'],
      (r) => Promise.resolve(r === 'v13-base' ? emptyRun(r, 'missing') : fakeSession(r, calls, [])),
      ['x', 'y'].map(fixture),
      () => {},
      'test'
    );
    expect(runs.map((r) => `${r.renderer}:${r.status}`)).toEqual([
      'v13:ready',
      'v13-base:missing',
      'pele:ready',
    ]);
    expect(calls).toEqual(['x:v13', 'x:pele', 'y:pele', 'y:v13']);
  });
});
