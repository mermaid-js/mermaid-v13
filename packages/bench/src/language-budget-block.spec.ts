/**
 * The block language-service bench fixture and cycle (R-LANG-4, #557, #558), as the venn one is
 * checked: the fixture is a 50,000-character block diagram with no diagnostics and every query
 * in a cycle does its work. The absolute ≤ 15 ms (D156) on the reference runner is
 * `pnpm --filter @mermaid-js/bench exec tsx --conditions=mermaid-source src/cli/language-block.ts --enforce`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { typing } from './language.ts';
import { BLOCK_FIXTURE, blockCycle, measureBlock } from './language-block.ts';

const service = createLanguageService();
beforeAll(() => service.preload({ types: ['block'] }));

describe('the block language-service bench fixture', () => {
  it('is a 50,000-character block diagram with no diagnostics', () => {
    expect(BLOCK_FIXTURE.length).toBeGreaterThanOrEqual(50_000);
    const doc = blockCycle(service, BLOCK_FIXTURE).doc;
    expect(doc.facet?.id).toBe('block');
    expect(doc.diagnostics()).toEqual([]);
  });

  it('runs every query in a cycle, each answering at the cursor', () => {
    const { doc, answers } = blockCycle(service, BLOCK_FIXTURE);
    expect(doc.text.slice(answers.definition!.start, answers.definition!.end)).toBe('a7');
    // `a7`: where it is declared and its chain; the rename edits each.
    expect(answers.references).toBe(2);
    expect(answers.renameEdits).toBe(answers.references);
    expect(answers.astAt).toBeGreaterThan(0);
    expect(answers.folds).toBeGreaterThan(200);
    expect(answers.tokens).toBeGreaterThan(10_000);
    expect(answers.completions).toBeGreaterThan(0);
    expect(answers.hover).toBe(true);
  });

  it('reports per-stage times that add up to the cycle', () => {
    const r = measureBlock(service, typing(BLOCK_FIXTURE), { runs: 5, warmup: 2 });
    const sum = Object.values(r.stages).reduce((a, b) => a + b, 0);
    expect(r.total).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(r.total * 0.25);
    expect(sum).toBeLessThan(r.total * 2.5);
  }, 60_000);
});
