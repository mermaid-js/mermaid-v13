/**
 * The cynefin language-service bench fixture and cycle (R-LANG-4, #469), as
 * `language-budget-sequence.spec.ts` checks sequence's: the fixture is a 50,000-character
 * cynefin diagram with no errors and every query in a cycle does its work. The absolute
 * ≤ 15 ms (D156) on the reference runner is `pnpm --filter bench language:cynefin --enforce`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { typing } from './language.ts';
import { CYNEFIN_FIXTURE, cynefinCycle, measureCynefin } from './language-cynefin.ts';

const service = createLanguageService();
beforeAll(() => service.preload({ types: ['cynefin'] }));

describe('the cynefin language-service bench fixture', () => {
  it('is a 50,000-character cynefin diagram with no diagnostics', () => {
    expect(CYNEFIN_FIXTURE.length).toBeGreaterThanOrEqual(50_000);
    const doc = cynefinCycle(service, CYNEFIN_FIXTURE).doc;
    expect(doc.facet?.id).toBe('cynefin');
    expect(doc.diagnostics()).toEqual([]);
  });

  it('runs every query in a cycle, each answering at the cursor', () => {
    const { doc, answers } = cynefinCycle(service, CYNEFIN_FIXTURE);
    expect(doc.text.slice(answers.definition!.start, answers.definition!.end)).toBe('complex');
    expect(answers.references).toBeGreaterThan(100);
    // The five names are fixed (D367): rename is refused.
    expect(answers.renameEdits).toBe(-1);
    expect(answers.astAt).toBeGreaterThan(0);
    expect(answers.folds).toBeGreaterThanOrEqual(5);
    expect(answers.tokens).toBeGreaterThan(2_000);
    expect(answers.completions).toBeGreaterThan(0);
    expect(answers.hover).toBe(true);
  });

  it('reports per-stage times that add up to the cycle', () => {
    const r = measureCynefin(service, typing(CYNEFIN_FIXTURE), { runs: 5, warmup: 2 });
    const sum = Object.values(r.stages).reduce((a, b) => a + b, 0);
    expect(r.total).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(r.total * 0.25);
    expect(sum).toBeLessThan(r.total * 2.5);
  }, 60_000);
});
