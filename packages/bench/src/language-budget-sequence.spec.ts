/**
 * R-LANG-4 in PR CI for sequence, as ratios (timing tests never assert absolute times), as
 * `language-budget.spec.ts` does for flowchart: on the 50k-character sequence fixture, one
 * editing cycle (update + every query) costs at most four and a half bare parses, and four times the
 * text at most four times the cycle. The absolute ≤ 15 ms (D156) on the reference runner is
 * `pnpm --filter bench language:sequence --enforce`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { sequenceLanguage } from '@mermaid-js/diagram-sequence/language';
import { bestOfEach, typing } from './language.ts';
import { measureSequence, SEQUENCE_FIXTURE, sequenceCycle } from './language-sequence.ts';

const service = createLanguageService();
beforeAll(() => service.preload({ types: ['sequence'] }));

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
 * load hits both sides alike, in CPU time, after warm-up rounds and with a minor GC before each
 * run (`bestOfEach`).
 */
describe('the R-LANG-4 budget for sequence, as ratios', () => {
  /**
   * 4.5, not 4 as for flowchart. A cycle holds three structural parses (`update`, the rename's
   * read-back of the renamed text, and the completions probe) plus semantic tokens, so it
   * measures 3.5–3.9 bare parses under vitest, locally and on the hosted runner. Before
   * `bestOfEach` warmed up and collected the young generation, a cold best of 25 read up to 4.1
   * on a slow hosted runner, and failed at 4.68 (#348). `isValidId` is one small parse (about
   * 0.03 ms) and no longer a factor. Outside vitest (tsx) a bare parse is about three times
   * faster while semantic tokens are not, so the same cycle is about five bare parses there:
   * the ratio is only meaningful under the runner that measures it.
   */
  it('a cycle costs at most four and a half bare parses', () => {
    const texts = typing(SEQUENCE_FIXTURE);
    const [parse, full] = bestOfEach(
      60,
      (i) => sequenceLanguage.parse(texts(i), { keepTokens: true }),
      (i) => sequenceCycle(service, texts(i))
    );
    expect(full! / parse!).toBeLessThanOrEqual(4.5);
  }, 60_000);

  /**
   * 6.2, not 6: local best-of-15 runs sit at 4.7–5.1, but a hosted CI run reached 6.06 (#254)
   * with no change to sequence. Quadratic growth would give 16, so 6.2 still catches it.
   */
  it('four times the text at most four times the cycle (plus noise; quadratic gives 16)', () => {
    const body = SEQUENCE_FIXTURE.slice(SEQUENCE_FIXTURE.indexOf('  %% block 0'));
    const one = typing(SEQUENCE_FIXTURE);
    const four = typing(SEQUENCE_FIXTURE + body + body + body);
    const [a, b] = bestOfEach(
      15,
      (i) => sequenceCycle(service, one(i)),
      (i) => sequenceCycle(service, four(i))
    );
    expect(b! / a!).toBeLessThanOrEqual(6.2);
  }, 60_000);

  /**
   * Rename alone, where the renamed name occurs four times as often in four times the text:
   * applying E edits to N characters must be O(N + E), not O(N × E). Rebuilding the text once
   * per edit made this ratio about 6.4 locally and pushed the whole cycle past 6 on CI.
   */
  it('rename on four times the text costs at most five times as much (quadratic gives 16)', () => {
    const body = SEQUENCE_FIXTURE.slice(SEQUENCE_FIXTURE.indexOf('  %% block 0'));
    const docOne = service.update('bench:///rename-1x.mmd', SEQUENCE_FIXTURE);
    const fourText = SEQUENCE_FIXTURE + body + body + body;
    const docFour = service.update('bench:///rename-4x.mmd', fourText);
    const at = SEQUENCE_FIXTURE.indexOf(' P7 as ') + 1;
    const [a, b] = bestOfEach(
      15,
      () => docOne.rename(at, 'renamedParticipant'),
      () => docFour.rename(at, 'renamedParticipant')
    );
    expect(b! / a!).toBeLessThanOrEqual(5);
  }, 60_000);
});
