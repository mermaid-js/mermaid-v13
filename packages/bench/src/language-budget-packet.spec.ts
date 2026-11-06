/**
 * R-LANG-4 in PR CI for packet, as ratios (timing tests never assert absolute times), as
 * `language-budget-sequence.spec.ts` does for sequence: on the 50k-character packet fixture,
 * one editing cycle (update + every query) costs at most a few bare parses, and four times the
 * text at most four times the cycle.
 */
import { describe, expect, it } from 'vitest';
import { createLanguageService } from '@mermaid-js/language-service';
import { detectPacket, packetLanguage } from '@mermaid-js/diagram-packet/language';
import { bestOfEach, typing } from './language.ts';
import { PACKET_FIXTURE, packetCycle } from './language-packet.ts';

// The facet as an eager row until packet's manifest has its `language` entry (#462).
const service = createLanguageService({
  facets: [
    { type: 'packet', id: 'packet', detector: (t) => detectPacket(t), facet: packetLanguage },
  ],
});

describe('the packet language-service bench fixture', () => {
  it('is a 50,000-character packet with no diagnostics', () => {
    expect(PACKET_FIXTURE.length).toBeGreaterThanOrEqual(50_000);
    const doc = packetCycle(service, PACKET_FIXTURE).doc;
    expect(doc.facet?.id).toBe('packet');
    expect(doc.diagnostics()).toEqual([]);
  });

  it('runs every query in a cycle, each answering at the cursor', () => {
    const { doc, answers } = packetCycle(service, PACKET_FIXTURE);
    expect(doc.text.slice(answers.definition!.start, answers.definition!.end)).toBe(
      'Source Port 7'
    );
    // D346: a label is its own symbol, so one reference and one rename edit.
    expect(answers.references).toBe(1);
    expect(answers.renameEdits).toBe(1);
    expect(answers.astAt).toBeGreaterThan(0);
    expect(answers.folds).toBeGreaterThan(0);
    expect(answers.tokens).toBeGreaterThan(5_000);
    // The statements, `+` and the next start bit.
    expect(answers.completions).toBe(5);
    expect(answers.hover).toBe(true);
  });
});

/**
 * Robust under machine load: each ratio takes the best of many runs, measured alternately so
 * load hits both sides alike, in CPU time.
 */
describe('the R-LANG-4 budget for packet, as ratios', () => {
  /**
   * 4.5, as for sequence: a cycle holds three structural parses (`update`, the rename's
   * read-back and the completion probe), semantic tokens, and the next start bit's parse of the
   * lines since the last field (a few lines). Best runs sit at 4.0–4.1 bare parses under vitest.
   */
  it('a cycle costs at most four and a half bare parses', () => {
    const texts = typing(PACKET_FIXTURE);
    const [parse, full] = bestOfEach(
      25,
      (i) => packetLanguage.parse(texts(i), { keepTokens: true }),
      (i) => packetCycle(service, texts(i))
    );
    expect(full! / parse!).toBeLessThanOrEqual(4.5);
  }, 60_000);

  it('four times the text at most four times the cycle (plus noise; quadratic gives 16)', () => {
    const body = PACKET_FIXTURE.slice(PACKET_FIXTURE.indexOf('  %% block 0'));
    const one = typing(PACKET_FIXTURE);
    const four = typing(PACKET_FIXTURE + body + body + body);
    const [a, b] = bestOfEach(
      15,
      (i) => packetCycle(service, one(i)),
      (i) => packetCycle(service, four(i))
    );
    expect(b! / a!).toBeLessThanOrEqual(6.2);
  }, 60_000);
});
