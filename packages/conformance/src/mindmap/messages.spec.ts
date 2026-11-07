import { describe, expect, it } from 'vitest';
import { JISON_NAMES, MindmapTokenKind, parseMindmap } from '@mermaid-js/diagram-mindmap';
import { mutator, random } from '../fuzz/mutator.ts';
import { mindmapCases, mindmapCorpus } from './corpus.ts';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every mindmap corpus source in seeded ways and check every message produced.
 */
// (`document`, `statement`, `node` and `stop` are plain words, so only the compound rule names.)
const RULES = ['mindMap', 'spaceLines', 'nodeWithId', 'nodeWithoutId'];
// Token names: jison terminals with `_` or all capitals, and v13 kind names that are compounds
// (`NodeDStart`, `SpaceList`, …); plain words such as `mindmap` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(MindmapTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);
/** The author's own text a message quotes: a label, and what was found. */
const quoted = (message: string): string =>
  message.replace(/\("[\s\S]*?"\)/g, '()').replace(/got `[\s\S]*?`/g, 'got `…`');

const FRAGMENTS = ['(', ')', '((', '))', '[', ']', '{{', '}}', '{', '}', '"', '"`', '\n', '\r\n'];
const FRAGMENTS_MORE = ['mindmap', '  ', '\n\n', '%%', ':::', '::icon(', '-)', '(-', '\t'];

describe('mindmap error messages', () => {
  it('never name a token or grammar rule', async () => {
    const corpus = [...(await mindmapCorpus()), ...mindmapCases()].map((c) => c.source);
    const next = mutator(corpus, [...FRAGMENTS, ...FRAGMENTS_MORE], random(294));
    const bad: string[] = [];
    let errors = 0;
    for (let i = 0; i < 5000; i++) {
      const src = next();
      for (const d of parseMindmap(src).diagnostics) {
        if (d.severity === 'error') errors++;
        if (BANNED.test(quoted(d.message)) || d.expected?.some((e) => BANNED.test(e))) {
          bad.push(`${JSON.stringify(src)}: ${d.message}`);
        }
      }
    }
    expect(errors).toBeGreaterThan(1000);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});
