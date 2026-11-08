/**
 * The venn language-service bench fixture and cycle (R-LANG-4, #498), as the cynefin one is
 * checked: the fixture is a 50,000-character venn diagram with no diagnostics and every query in
 * a cycle does its work. The absolute ≤ 15 ms (D156) on the reference runner is
 * `pnpm --filter bench language:venn --enforce`.
 */
import { describe, expect, it } from 'vitest';
import { detectVenn, vennLanguage } from '@mermaid-js/diagram-venn/language';
import { createLanguageService } from '@mermaid-js/language-service';
import { typing } from './language.ts';
import { measureVenn, VENN_FIXTURE, vennCycle } from './language-venn.ts';

// The facet as an eager row until venn's manifest has its `language` entry (#501).
const service = createLanguageService({
  facets: [{ type: 'venn', id: 'venn', detector: (t) => detectVenn(t), facet: vennLanguage }],
});

describe('the venn language-service bench fixture', () => {
  it('is a 50,000-character venn diagram with no diagnostics', () => {
    expect(VENN_FIXTURE.length).toBeGreaterThanOrEqual(50_000);
    const doc = vennCycle(service, VENN_FIXTURE).doc;
    expect(doc.facet?.id).toBe('venn');
    expect(doc.diagnostics()).toEqual([]);
  });

  it('runs every query in a cycle, each answering at the cursor', () => {
    const { doc, answers } = vennCycle(service, VENN_FIXTURE);
    expect(doc.text.slice(answers.definition!.start, answers.definition!.end)).toBe('S3');
    expect(answers.references).toBe(6);
    // `S3`: its `set`, two unions, two text statements and a style; the rename edits each.
    expect(answers.renameEdits).toBe(answers.references);
    expect(answers.astAt).toBeGreaterThan(0);
    expect(answers.folds).toBeGreaterThan(500);
    expect(answers.tokens).toBeGreaterThan(2_000);
    expect(answers.completions).toBeGreaterThan(0);
    expect(answers.hover).toBe(true);
  });

  it('reports per-stage times that add up to the cycle', () => {
    const r = measureVenn(service, typing(VENN_FIXTURE), { runs: 5, warmup: 2 });
    const sum = Object.values(r.stages).reduce((a, b) => a + b, 0);
    expect(r.total).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(r.total * 0.25);
    expect(sum).toBeLessThan(r.total * 2.5);
  }, 60_000);
});
