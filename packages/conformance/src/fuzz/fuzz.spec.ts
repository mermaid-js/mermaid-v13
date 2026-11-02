import { describe, expect, it } from 'vitest';
import { fuzzCase, fuzzCorpus, formatFailure, fuzzFlowchart } from './run.ts';
import { mutator, random } from './mutator.ts';

/**
 * The PR-sized fuzz run: a fixed seed and a few hundred inputs, so a regression shows up in
 * review. The nightly job (`.github/workflows/fuzz-nightly.yml`) runs `src/cli/fuzz.ts` with
 * a fresh seed and many more inputs.
 */
describe('fuzz harness', () => {
  it('the mutator is deterministic per seed', () => {
    const corpus = ['flowchart TD\n  A --> B\n', 'graph LR\n  X[label] --- Y\n'];
    const a = mutator(corpus, ['-->', '['], random(42));
    const b = mutator(corpus, ['-->', '['], random(42));
    const first = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(10);
  });

  it('has a corpus to work from', async () => {
    expect((await fuzzCorpus()).length).toBeGreaterThan(700);
  });

  it('classifies a clean render, a rejection and a limit', async () => {
    expect(await fuzzCase('flowchart TD\n  A --> B\n')).toBe('rendered');
    expect(await fuzzCase('flowchart TD\n  A[unclosed\n')).toBe('rejected');
    expect(await fuzzCase('flowchart TD\n' + 'A-->B\n'.repeat(10000))).toBe('limit');
  });
});

describe('fuzz (PR run, seed 1)', () => {
  it('no crashes, hangs or allow-list violations', async () => {
    const report = await fuzzFlowchart({
      seed: Number(process.env.FUZZ_SEED ?? 1),
      count: Number(process.env.FUZZ ?? 400),
      sentences: 100,
    });
    process.stdout.write(
      `fuzz seed ${report.seed}: ${report.count} inputs ${JSON.stringify(report.outcomes)}\n`
    );
    expect(report.failures.map(formatFailure)).toEqual([]);
    expect(report.outcomes.rendered).toBeGreaterThan(report.count / 5);
  }, 300_000);
});
