import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pieFixtureAdapter } from './fixtures/pie-plugin.ts';
import { resolveCorpus, runParity } from './index.ts';

const external = mkdtempSync(join(tmpdir(), 'parse-fixtures-'));
mkdirSync(join(external, 'nested'));
writeFileSync(join(external, 'one.mmd'), 'pie\n"a" : 1');
writeFileSync(join(external, 'nested', 'two.mmd'), 'pie\n"a" : -1');
writeFileSync(join(external, 'notes.txt'), 'ignored');
afterAll(() => rmSync(external, { recursive: true, force: true }));

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

const suites = [{ adapter: pieFixtureAdapter, corpusDirs: ['e2e/diagrams/pie'] }];

describe('resolveCorpus', () => {
  it('reads the in-repo fixture dirs of the registered suites by default', async () => {
    const items = await collect(resolveCorpus({}, suites));
    expect(items.length).toBeGreaterThan(5);
    expect(items.every((i) => i.id.startsWith('e2e/diagrams/pie/') && i.id.endsWith('.mmd'))).toBe(
      true
    );
  });

  it('reads every .mmd under PARSE_FIXTURE_PATH instead when it is set', async () => {
    const items = await collect(resolveCorpus({ PARSE_FIXTURE_PATH: external }, suites));
    expect(items).toEqual([
      { id: 'external/nested/two.mmd', source: 'pie\n"a" : -1' },
      { id: 'external/one.mmd', source: 'pie\n"a" : 1' },
    ]);
  });

  it('feeds the same runner', async () => {
    const report = await runParity({
      adapters: [pieFixtureAdapter],
      corpus: resolveCorpus({ PARSE_FIXTURE_PATH: external }, suites),
    });
    expect(report.unlisted.map((d) => [d.id, d.kind])).toEqual([
      ['external/nested/two.mmd', 'accept'],
    ]);
  });
});
