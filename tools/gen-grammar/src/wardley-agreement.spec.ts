/**
 * Wardley highlighting (#500, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the wardley corpus, as
 * `radar-agreement.spec.ts` checks radar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectWardley,
  wardleyCategories,
  WardleyTokenKind as T,
  wardleyTokens,
} from '@mermaid-js/diagram-wardley/language';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/**
 * A `%%` comment line inside a block `accDescr { … }` (only in this fixture, which T4 added for
 * an `&` in such a comment). v12 removed the comment line before lexing, so the block is one
 * `accDescr` token around it and the comment is trivia. TextMate and Monarch, inside the block's
 * begin and end, colour the comment line as the block (Keyword); Lezer's tokenizer lets no token
 * run into a comment, so the block does not match as one token and its pieces get the
 * categories of what they look like. Every other block `accDescr` agrees.
 */
const FIXTURE = '/e2e/diagrams/wardley/nightly-check/parser-entity-codes.mmd';
const COMMENT_IN_BLOCK: Record<string, string> = {
  'Lezer: AccDescr is Keyword, highlighted Other': `${FIXTURE} at 262`,
  'Lezer: AccDescr is Keyword, highlighted Punctuation': `${FIXTURE} at 257`,
  'Lezer: AccDescr is Keyword, highlighted String': `${FIXTURE} at 266`,
  'Lezer: AccDescr is Keyword, highlighted Variable': `${FIXTURE} at 248`,
  'Monarch: Comment is Comment, highlighted Keyword': `${FIXTURE} at 270`,
  'TextMate: Comment is Comment, highlighted Keyword': `${FIXTURE} at 270`,
};

/**
 * A `---` … `---` block inside the body (v12's hidden YAML token, only in
 * `wardley-cases/yaml-body`): TextMate and Monarch, which read a line at a time, cannot follow
 * it over its line breaks (Lezer, which runs the patterns, agrees), as for pie and radar.
 */
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: Yaml is Meta, highlighted Number`, 'wardley-cases/yaml-body at 20'],
    [`${h}: Yaml is Meta, highlighted Operator`, 'wardley-cases/yaml-body at 13'],
    [`${h}: Yaml is Meta, highlighted Other`, 'wardley-cases/yaml-body at 18'],
    [`${h}: Yaml is Meta, highlighted Variable`, 'wardley-cases/yaml-body at 17'],
  ])
);

/**
 * Cases of `packages/conformance/corpus/wardley-cases.json` for the kinds the e2e corpus lacks:
 * an `ID` name (only where `NAME_WITH_SPACES` cannot start, as `_x`), a `---` block in the
 * body, directives, and `accTitle` without its `:` (an `ID` too).
 */
const CASES = [
  'wardley-cases/names-underscore',
  'wardley-cases/yaml-body',
  'wardley-cases/directives',
  'wardley-cases/acc-title-no-colon',
];

function cases(): [string, string][] {
  const file = join(ROOT, 'packages/conformance/corpus/wardley-cases.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; source: string }[];
  return CASES.map((id) => {
    const found = all.find((c) => c.id === id);
    if (!found) throw new Error(`no case ${id} in wardley-cases.json`);
    return [id, found.source];
  });
}

describe('four-way highlighting agreement (wardley)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectWardley);
    expect(sources.length).toBeGreaterThan(10);
    const result = agreement(
      { kinds: T, categories: wardleyCategories, tokens: wardleyTokens },
      await highlighters('wardley'),
      [...cases(), ...sources]
    );
    expect(result.disagreements).toEqual({ ...COMMENT_IN_BLOCK, ...LINE_BASED });
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
