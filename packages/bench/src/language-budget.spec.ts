/**
 * R-LANG-4 in PR CI, as ratios (timing tests never assert absolute times): on the 50k-character
 * bench fixture, one editing cycle (update + every query, `cycle` in language.ts) costs at most
 * a few bare parses, and four times the text at most four times the cycle. The absolute ≤ 15 ms (D156) on
 * the reference runner is the bench package's `language --enforce` script.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import { bestOfEach, cycle, LANGUAGE_FIXTURE, measureLanguage, typing } from './language.ts';

const service = createLanguageService();
beforeAll(() => service.preload({ types: ['flowchart'] }));

describe('the language-service bench fixture', () => {
  it('is a 50,000-character flowchart with no diagnostics', () => {
    expect(LANGUAGE_FIXTURE.length).toBeGreaterThanOrEqual(50_000);
    const doc = cycle(service, LANGUAGE_FIXTURE).doc;
    expect(doc.facet?.id).toBe('flowchart');
    expect(doc.diagnostics()).toEqual([]);
  });

  it('runs every query in a cycle, each answering at the cursor', () => {
    const { doc, answers } = cycle(service, LANGUAGE_FIXTURE);
    expect(doc.text.slice(answers.definition!.start, answers.definition!.end)).toBe('n7');
    expect(answers.references).toBeGreaterThan(2);
    expect(answers.renameEdits).toBe(answers.references);
    expect(answers.astAt).toBeGreaterThan(0);
    expect(answers.folds).toBeGreaterThan(70);
    expect(answers.tokens).toBeGreaterThan(5_000);
    expect(answers.completions).toBeGreaterThan(0);
    expect(answers.hover).toBe(true);
  });

  it('reports per-stage times that add up to the cycle', () => {
    const r = measureLanguage(service, { runs: 5, warmup: 2 });
    expect(Object.keys(r.stages)).toEqual([
      'update',
      'diagnostics',
      'foldingRanges',
      'semanticTokens',
      'definition',
      'references',
      'prepareRename',
      'rename',
      'astAt',
      'completions',
      'hover',
    ]);
    const sum = Object.values(r.stages).reduce((a, b) => a + b, 0);
    expect(r.total).toBeGreaterThan(0);
    // Medians of stages need not add up to the median cycle exactly (a loaded machine spreads
    // them); a stage left out or counted twice is far outside these bounds.
    expect(sum).toBeGreaterThan(r.total * 0.25);
    expect(sum).toBeLessThan(r.total * 2.5);
  }, 60_000);
});

/**
 * Robust under machine load (a parallel `pnpm test`, another build): each ratio takes the best
 * of many runs, measured alternately so load hits both sides alike, after warm-up rounds and
 * with a minor GC before each run (`bestOfEach`), and leaves room for noise while staying far
 * below what a regression gives.
 */
describe('the R-LANG-4 budget, as ratios', () => {
  it('a cycle costs at most four bare parses', () => {
    const texts = typing(LANGUAGE_FIXTURE);
    const [parse, full] = bestOfEach(
      60,
      (i) => flowchartLanguage.parse(texts(i), { keepTokens: true }),
      (i) => cycle(service, texts(i))
    );
    expect(full! / parse!).toBeLessThanOrEqual(4);
  }, 60_000);

  it('four times the text at most four times the cycle (plus noise; quadratic gives 16)', () => {
    const body = LANGUAGE_FIXTURE.slice(LANGUAGE_FIXTURE.indexOf('  subgraph'));
    const one = typing(LANGUAGE_FIXTURE);
    const four = typing(LANGUAGE_FIXTURE + body + body + body);
    const [a, b] = bestOfEach(
      15,
      (i) => cycle(service, one(i)),
      (i) => cycle(service, four(i))
    );
    expect(b! / a!).toBeLessThanOrEqual(6);
  }, 60_000);
});
