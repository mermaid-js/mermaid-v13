/**
 * Event modeling highlighting (#609, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the event modeling
 * corpus, as `wardley-agreement.spec.ts` checks wardley.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectEventModeling,
  eventmodelingCategories,
  EventModelingTokenKind as T,
  eventModelingTokens,
} from '@mermaid-js/diagram-eventmodeling/language';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow a token over its line
 * breaks (Lezer, which runs the patterns, agrees), as for wardley, pie and radar: a data block
 * (`{` ending its line, its lines, `}` starting a line), whose closer is a line break then `}`,
 * so its lines are coloured as code (matched by token kind, whichever fixture shows it first); and a `---` …
 * `---` block in the body (v12's hidden YAML token, only in `eventmodeling-cases/yaml-in-body`).
 * A block `accDescr { … }` is written as a span and agrees.
 */
const LINE_BASED = /^(?:Monarch|TextMate): (?:DataBlock is String|Yaml is Meta), highlighted \w+$/;

/**
 * Cases of `packages/conformance/corpus/eventmodeling-cases.json` for the kinds the e2e corpus
 * lacks: the data types but `json` and `md`, a `---` block in the body, and directives.
 */
const CASES = [
  'eventmodeling-cases/inline-typed-all',
  'eventmodeling-cases/yaml-in-body',
  'eventmodeling-cases/directive-line',
  'eventmodeling-cases/directive-in-line',
];

function cases(): [string, string][] {
  const file = join(ROOT, 'packages/conformance/corpus/eventmodeling-cases.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; source: string }[];
  return CASES.map((id) => {
    const found = all.find((c) => c.id === id);
    if (!found) throw new Error(`no case ${id} in eventmodeling-cases.json`);
    return [id, found.source];
  });
}

describe('four-way highlighting agreement (eventmodeling)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectEventModeling);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: eventmodelingCategories, tokens: eventModelingTokens },
      await highlighters('eventmodeling'),
      [...cases(), ...sources]
    );
    // Only the line-based gap, by token kind wherever it first shows (any fixture), and in both
    // line-based highlighters, so a fix shows up here too.
    const keys = Object.keys(result.disagreements);
    expect(keys.filter((k) => !LINE_BASED.test(k))).toEqual([]);
    for (const h of ['Monarch', 'TextMate'])
      for (const kind of ['DataBlock is String', 'Yaml is Meta'])
        expect(
          keys.some((k) => k.startsWith(`${h}: ${kind}`)),
          `${h}: ${kind}`
        ).toBe(true);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
