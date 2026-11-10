/**
 * The C4 language-service bench fixture and cycle (R-LANG-4, #543, #542), as the venn one is
 * checked: the fixture is a 50,000-character C4 diagram with no diagnostics and every query in a
 * cycle does its work; and, as a ratio (timing tests never assert absolute times), four times
 * the text costs at most four times the cycle. The absolute ≤ 15 ms (D156) on the reference runner is
 * `pnpm --filter @mermaid-js/bench exec tsx --conditions=mermaid-source src/cli/language-c4.ts --enforce`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { bestOfEach, typing } from './language.ts';
import { C4_FIXTURE, c4Cycle, measureC4 } from './language-c4.ts';

const service = createLanguageService();
beforeAll(() => service.preload({ types: ['c4'] }));

describe('the C4 language-service bench fixture', () => {
  it('is a 50,000-character C4 diagram with no diagnostics', () => {
    expect(C4_FIXTURE.length).toBeGreaterThanOrEqual(50_000);
    const doc = c4Cycle(service, C4_FIXTURE).doc;
    expect(doc.facet?.id).toBe('c4');
    expect(doc.diagnostics()).toEqual([]);
  });

  it('runs every query in a cycle, each answering at the cursor', () => {
    const { doc, answers } = c4Cycle(service, C4_FIXTURE);
    expect(doc.text.slice(answers.definition!.start, answers.definition!.end)).toBe('c3_2');
    // `c3_2`: its container and the two relations naming it; the rename edits each.
    expect(answers.references).toBe(3);
    expect(answers.renameEdits).toBe(answers.references);
    expect(answers.astAt).toBeGreaterThan(0);
    // A fold per boundary.
    expect(answers.folds).toBe(72);
    expect(answers.tokens).toBeGreaterThan(10_000);
    // Every alias a relation end can name.
    expect(answers.completions).toBeGreaterThan(400);
    expect(answers.hover).toBe(true);
  });

  it('reports per-stage times that add up to the cycle', () => {
    const r = measureC4(service, typing(C4_FIXTURE), { runs: 5, warmup: 2 });
    const sum = Object.values(r.stages).reduce((a, b) => a + b, 0);
    expect(r.total).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(r.total * 0.25);
    expect(sum).toBeLessThan(r.total * 2.5);
  }, 60_000);
});

/**
 * Robust under machine load: the ratio takes the best of many runs, measured alternately so load
 * hits both sides alike, in CPU time (`bestOfEach`), as flowchart's and packet's do.
 */
describe('the R-LANG-4 budget for C4, as a ratio', () => {
  it('four times the text at most four times the cycle (plus noise; quadratic gives 16)', () => {
    const body = C4_FIXTURE.slice(C4_FIXTURE.indexOf('System_Boundary(b0,'));
    const one = typing(C4_FIXTURE);
    const four = typing(C4_FIXTURE + body + body + body);
    const [a, b] = bestOfEach(
      15,
      (i) => c4Cycle(service, one(i)),
      (i) => c4Cycle(service, four(i))
    );
    expect(b! / a!).toBeLessThanOrEqual(6);
  }, 60_000);
});
