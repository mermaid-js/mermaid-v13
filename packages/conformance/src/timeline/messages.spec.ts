import { describe, expect, it } from 'vitest';
import { JISON_NAMES, parseTimeline, TimelineTokenKind } from '@mermaid-js/diagram-timeline';
import { mutator, random } from '../fuzz/mutator.ts';
import { timelineCases, timelineCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every timeline corpus source in seeded ways and check every message produced.
 */
// (`document`, `line` and `statement` are plain words, so only the compound rule names.)
const RULES = ['timeline_header', 'period_statement', 'event_statement'];
// Token names: jison terminals with `_` or all capitals, and v13 kind names that are compounds
// (`TimelineLR`, `AccDescrValue`, …); plain words such as `title` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(TimelineTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const FRAGMENTS = [':', ': ', '::', '#', '%%', '\n', ';', '{', '}', '\r\n', ' : '];
const FRAGMENTS_MORE = ['timeline', 'timeline TD', 'title', 'section', 'accTitle:', 'accDescr {'];

describe('timeline error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await timelineCorpus()), ...timelineCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(291));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseTimeline(src).diagnostics) {
        if (d.severity === 'error') errors++;
        if (BANNED.test(d.message) || d.expected?.some((e) => BANNED.test(e))) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
