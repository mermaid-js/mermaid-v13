import { describe, expect, it } from 'vitest';
import { pieFixtureAdapter } from './fixtures/pie-plugin.ts';
import { inputHash, parseDivergences, runParity } from './index.ts';
import type { Divergence } from './index.ts';

const agreeing = [
  { id: 'pie/basic', source: 'pie\n"a" : 1\n"b" : 2' },
  { id: 'pie/title', source: 'pie showData\ntitle Pets\n"Dogs" : 386\n"Cats" : 85.5' },
  { id: 'pie/broken', source: 'pie\n"a" 1' },
];
// v12 rejects negative slice values; the fixture plugin accepts them.
const negative = { id: 'pie/negative', source: 'pie\n"a" : -1' };

const entry = (over: Partial<Divergence>): Divergence => ({
  id: negative.id,
  inputHash: inputHash(negative.source),
  kind: 'accept',
  reason: 'fixture plugin allows negative values',
  owner: '@knsv',
  since: '2026-11-02',
  ...over,
});

describe('runParity with a fixture diagram plugin', () => {
  it('agrees with mermaid@12 on accept, reject and model', async () => {
    const report = await runParity({ adapters: [pieFixtureAdapter], corpus: agreeing });
    expect(report.results.map((r) => [r.id, r.status, r.oracleAccepted])).toEqual([
      ['pie/basic', 'agree', true],
      ['pie/title', 'agree', true],
      ['pie/broken', 'agree', false],
    ]);
    expect(report.ok).toBe(true);
  });
});

describe('divergences', () => {
  it('fails on a divergence divergences.json does not list', async () => {
    const report = await runParity({ adapters: [pieFixtureAdapter], corpus: [negative] });
    expect(report.ok).toBe(false);
    expect(report.unlisted).toEqual([
      expect.objectContaining({
        id: 'pie/negative',
        kind: 'accept',
        inputHash: inputHash(negative.source),
      }),
    ]);
  });

  it('passes when the divergence is listed', async () => {
    const report = await runParity({
      adapters: [pieFixtureAdapter],
      corpus: [negative, ...agreeing],
      divergences: [entry({})],
    });
    expect(report.ok).toBe(true);
    expect(report.expected.map((d) => d.id)).toEqual(['pie/negative']);
  });

  it('fails when a listed divergence no longer diverges', async () => {
    const report = await runParity({
      adapters: [pieFixtureAdapter],
      corpus: agreeing,
      divergences: [entry({ id: 'pie/basic', inputHash: inputHash(agreeing[0]!.source) })],
    });
    expect(report.ok).toBe(false);
    expect(report.disappeared.map((d) => d.id)).toEqual(['pie/basic']);
  });

  it('fails when the listed kind is wrong', async () => {
    const report = await runParity({
      adapters: [pieFixtureAdapter],
      corpus: [negative],
      divergences: [entry({ kind: 'model' })],
    });
    expect(report.unlisted.map((d) => d.kind)).toEqual(['accept']);
    expect(report.disappeared.map((d) => d.kind)).toEqual(['model']);
  });

  it('treats an entry as stale once its source changes', async () => {
    const report = await runParity({
      adapters: [pieFixtureAdapter],
      corpus: [{ id: negative.id, source: 'pie\n"b" : -2' }],
      divergences: [entry({})],
    });
    expect(report.unlisted).toHaveLength(1);
    expect(report.disappeared).toHaveLength(1);
  });

  it('ignores listed entries whose source is not in this run', async () => {
    const report = await runParity({
      adapters: [pieFixtureAdapter],
      corpus: agreeing,
      divergences: [entry({})],
    });
    expect(report.ok).toBe(true);
  });

  it('reports model divergences with the differing paths', async () => {
    const lossy = {
      ...pieFixtureAdapter,
      normaliseV13: () => ({ title: 'x', showData: false, sections: [] }),
    };
    const report = await runParity({ adapters: [lossy], corpus: [agreeing[1]!] });
    expect(report.unlisted).toEqual([
      expect.objectContaining({ kind: 'model', detail: 'sections.length, showData, title' }),
    ]);
  });

  it('reports v13 rejecting what the oracle accepts', async () => {
    const strict = {
      ...pieFixtureAdapter,
      parse: () => {
        throw new Error('nope');
      },
    };
    const report = await runParity({ adapters: [strict], corpus: [agreeing[0]!] });
    expect(report.unlisted).toEqual([expect.objectContaining({ kind: 'reject', detail: 'nope' })]);
  });

  it('skips sources no adapter claims', async () => {
    const report = await runParity({
      adapters: [pieFixtureAdapter],
      corpus: [{ id: 'flow', source: 'flowchart LR\n  A --> B' }],
    });
    expect(report.results.map((r) => r.status)).toEqual(['skipped']);
    expect(report.ok).toBe(true);
  });
});

describe('divergences.json validation', () => {
  it('rejects entries without a reason or owner, unknown kinds and duplicates', () => {
    const ok = entry({});
    expect(parseDivergences([ok])).toEqual([ok]);
    expect(() => parseDivergences([{ ...ok, reason: '' }])).toThrow(
      '"reason" must be a non-empty string'
    );
    expect(() => parseDivergences([{ ...ok, owner: undefined }])).toThrow('"owner"');
    expect(() => parseDivergences([{ ...ok, kind: 'render' }])).toThrow('unknown kind');
    expect(() => parseDivergences([ok, ok])).toThrow('duplicate entry');
  });
});
