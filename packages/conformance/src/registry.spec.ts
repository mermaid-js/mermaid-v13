import { describe, expect, it } from 'vitest';
import { resolveCorpus } from './corpus.ts';
import { PARITY_SUITES } from './registry.ts';
import { typeDirs } from './type-files.ts';

/**
 * `PARITY_SUITES` is gathered from each type's `src/<type>/suite.ts`, in folder order. The
 * runner picks an item's adapter by the oracle's type (`v12Types`), or by the adapters'
 * detectors when the oracle rejects it, taking the first that matches: so that the folder
 * order cannot change a result, no two adapters may claim a v12 type, nor detect one item.
 */
describe('the parity registry', () => {
  const adapters = [...new Set(PARITY_SUITES.map((s) => s.adapter))];

  it('has a suite from every type folder with a suite.ts', () => {
    expect(typeDirs('suite.ts').length).toBeGreaterThan(20);
    expect(PARITY_SUITES.length).toBeGreaterThanOrEqual(typeDirs('suite.ts').length);
  });

  it('gives each v12 type to one adapter', () => {
    const claims = adapters.flatMap((a) => a.v12Types.map((t) => [t, a.id] as const));
    const owners = new Map<string, string[]>();
    for (const [t, id] of claims) owners.set(t, [...(owners.get(t) ?? []), id]);
    expect([...owners].filter(([, ids]) => ids.length > 1)).toEqual([]);
  });

  it('has each corpus item detected by one adapter at most', async () => {
    const overlaps: string[] = [];
    let items = 0;
    for await (const item of resolveCorpus({}, PARITY_SUITES)) {
      items++;
      const ids = adapters.filter((a) => a.detect(item.source)).map((a) => a.id);
      if (ids.length > 1) overlaps.push(`${item.id}: ${ids.join(', ')}`);
    }
    expect(items).toBeGreaterThan(1000);
    expect(overlaps).toEqual([]);
  }, 120_000);
});
