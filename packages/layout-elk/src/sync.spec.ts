import elkBundled from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import corpus from '../fixtures/v12-elk-corpus.json' with { type: 'json' };
import { layoutSync } from './sync.ts';

// Every graph v12 develop's ELK adapter hands to elk.layout() for the e2e/diagrams sources
// that select ELK (ER, flowchart, state, class, requirement), captured in Chromium.
const graphs = corpus as unknown as { source: string; input: ElkNode }[];

// The oracle is elkjs's own Promise API, imported the way v12 develop imports it. Its types
// describe a CommonJS module; the constructor is both `module.exports` and its `default`.
const ELK = elkBundled.default;
const viaPromise = (graph: ElkNode): Promise<ElkNode> => new ELK().layout(graph);

/**
 * GWT stamps `$H`, a process-wide identity-hash counter, on every object it hashes. Its values
 * depend on how many objects that elkjs copy has hashed before, so two `layout()` calls on the
 * same graph differ in `$H` and nowhere else. Equality is therefore taken without it.
 */
function withoutGwtHashes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutGwtHashes);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$H')
      .map(([key, v]) => [key, withoutGwtHashes(v)])
  );
}

const small = (): ElkNode => ({
  id: 'root',
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' },
  children: [
    { id: 'a', width: 40, height: 20 },
    { id: 'b', width: 60, height: 30, labels: [{ text: 'b', width: 8, height: 12 }] },
    { id: 'c', width: 40, height: 20 },
  ],
  edges: [
    { id: 'e1', sources: ['a'], targets: ['b'] },
    { id: 'e2', sources: ['a'], targets: ['c'] },
    { id: 'e3', sources: ['c'], targets: ['b'] },
  ],
});

// elkjs refuses an edge to a node that does not exist.
const bad = (): ElkNode => ({
  id: 'root',
  children: [{ id: 'a', width: 10, height: 10 }],
  edges: [{ id: 'e', sources: ['a'], targets: ['missing'] }],
});

describe('layoutSync', () => {
  it('compares without $H: elkjs layout() itself differs from run to run only there', async () => {
    const elk = new ELK();
    const first = await elk.layout(small());
    const second = await elk.layout(small());
    expect(second).not.toStrictEqual(first);
    expect(withoutGwtHashes(second)).toStrictEqual(withoutGwtHashes(first));
  });

  it('returns what elkjs layout() resolves to, without awaiting', async () => {
    const expected = await viaPromise(small());
    const actual = layoutSync(small());
    expect(withoutGwtHashes(actual)).toStrictEqual(withoutGwtHashes(expected));
    expect(actual.children?.[1]?.y).toBeGreaterThan(0);
  });

  it('applies layoutOptions the way layout(graph, { layoutOptions }) does', async () => {
    // Defaults under the graph's own options: the graph's 'elk.direction' still wins.
    const layoutOptions = {
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
    };
    const expected = await new ELK().layout(small(), { layoutOptions });
    const actual = layoutSync(small(), { layoutOptions });
    expect(withoutGwtHashes(actual)).toStrictEqual(withoutGwtHashes(expected));
    const plain = await viaPromise(small());
    expect(withoutGwtHashes(expected)).not.toStrictEqual(withoutGwtHashes(plain));
  });

  it('throws the error elkjs layout() rejects with, and keeps working after it', async () => {
    const rejected = await viaPromise(bad()).then(
      () => undefined,
      (error: unknown) => error
    );
    expect(rejected).toBeInstanceOf(Error);
    expect(() => layoutSync(bad())).toThrow((rejected as Error).message);
    const after = layoutSync(small());
    expect(withoutGwtHashes(after)).toStrictEqual(withoutGwtHashes(await viaPromise(small())));
  });

  it('has the whole ELK corpus to compare', () => {
    expect(graphs.length).toBe(80);
  });

  it.each(graphs.map((g) => [g.source, g.input] as const))(
    'matches elkjs layout() on %s',
    async (_source, input) => {
      const expected = await viaPromise(structuredClone(input));
      const actual = layoutSync(structuredClone(input));
      expect(withoutGwtHashes(actual)).toStrictEqual(withoutGwtHashes(expected));
    }
  );

  describe('schedules nothing', () => {
    const scheduled: string[] = [];
    const spy = (name: 'setTimeout' | 'setInterval' | 'setImmediate' | 'queueMicrotask') =>
      vi.spyOn(globalThis, name).mockImplementation(((..._args: unknown[]) => {
        scheduled.push(name);
        return 0;
      }) as never);

    afterEach(() => {
      vi.restoreAllMocks();
      scheduled.length = 0;
    });

    it('sees the timers elkjs layout() starts (control)', () => {
      spy('setTimeout');
      void new ELK().layout(small());
      expect(scheduled).toContain('setTimeout');
    });

    it('starts no timer, immediate or microtask over the corpus and an error', async () => {
      vi.resetModules();
      const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout');
      for (const name of ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask'] as const)
        spy(name);
      // A fresh module instance, so its first call (which registers the algorithms) is counted.
      const fresh = await import('./sync.ts');
      for (const { input } of graphs) fresh.layoutSync(structuredClone(input));
      // GWT reports uncaught errors with setTimeout(throw); a thrown layout must not reach it.
      expect(() => fresh.layoutSync(bad())).toThrow();
      expect(scheduled).toEqual([]);
      vi.restoreAllMocks();
      expect(process.getActiveResourcesInfo().filter((r) => r === 'Timeout')).toEqual(before);
    });
  });
});
