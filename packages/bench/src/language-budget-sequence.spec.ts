/**
 * R-LANG-4 in PR CI for sequence, as ratios (timing tests never assert absolute times), as
 * `language-budget.spec.ts` does for flowchart: on the 50k-character sequence fixture, one
 * editing cycle (update + every query) costs at most a few bare parses, and four times the
 * text at most four times the cycle. The absolute ≤ 15 ms (D156) on the reference runner is
 * `pnpm --filter bench language:sequence --enforce`.
 */
import { describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { sequenceLanguage } from '@mermaid-js/diagram-sequence/language';
import { bestOfEach, typing } from './language.ts';
import { measureSequence, SEQUENCE_FIXTURE, sequenceCycle } from './language-sequence.ts';

// Until the manifest registers the facet (#145), the service gets it as an eager row.
const service = createLanguageService({
  facets: [
    {
      type: 'sequence',
      id: 'sequence',
      detector: (t) => /^\s*sequenceDiagram/.test(t),
      facet: sequenceLanguage,
    },
  ],
});

describe('the sequence language-service bench fixture', () => {
  it('is a 50,000-character sequence diagram with no diagnostics', () => {
    expect(SEQUENCE_FIXTURE.length).toBeGreaterThanOrEqual(50_000);
    const doc = sequenceCycle(service, SEQUENCE_FIXTURE).doc;
    expect(doc.facet?.id).toBe('sequence');
    expect(doc.diagnostics()).toEqual([]);
  });

  it('runs every query in a cycle, each answering at the cursor', () => {
    const { doc, answers } = sequenceCycle(service, SEQUENCE_FIXTURE);
    expect(doc.text.slice(answers.definition!.start, answers.definition!.end)).toBe('P7');
    expect(answers.references).toBeGreaterThan(2);
    expect(answers.renameEdits).toBe(answers.references);
    expect(answers.astAt).toBeGreaterThan(0);
    expect(answers.folds).toBeGreaterThan(400);
    expect(answers.tokens).toBeGreaterThan(5_000);
    expect(answers.completions).toBeGreaterThan(0);
    expect(answers.hover).toBe(true);
  });

  it('reports per-stage times that add up to the cycle', () => {
    const r = measureSequence(service, typing(SEQUENCE_FIXTURE), { runs: 5, warmup: 2 });
    const sum = Object.values(r.stages).reduce((a, b) => a + b, 0);
    expect(r.total).toBeGreaterThan(0);
    expect(sum).toBeGreaterThan(r.total * 0.25);
    expect(sum).toBeLessThan(r.total * 2.5);
  }, 60_000);
});

/**
 * Robust under machine load: each ratio takes the best of many runs, measured alternately so
 * load hits both sides alike, in CPU time.
 */
describe('the R-LANG-4 budget for sequence, as ratios', () => {
  it('a cycle costs at most four bare parses', () => {
    const texts = typing(SEQUENCE_FIXTURE);
    const [parse, full] = bestOfEach(
      25,
      (i) => sequenceLanguage.parse(texts(i), { keepTokens: true }),
      (i) => sequenceCycle(service, texts(i))
    );
    expect(full! / parse!).toBeLessThanOrEqual(4);
  }, 60_000);

  it('four times the text at most four times the cycle (plus noise; quadratic gives 16)', () => {
    const body = SEQUENCE_FIXTURE.slice(SEQUENCE_FIXTURE.indexOf('  %% block 0'));
    const one = typing(SEQUENCE_FIXTURE);
    const four = typing(SEQUENCE_FIXTURE + body + body + body);
    const [a, b] = bestOfEach(
      15,
      (i) => sequenceCycle(service, one(i)),
      (i) => sequenceCycle(service, four(i))
    );
    expect(b! / a!).toBeLessThanOrEqual(6);
  }, 60_000);
});
