/**
 * Usecase highlighting (#568, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the usecase corpus, as
 * `wardley-agreement.spec.ts` checks wardley.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  detectUsecase,
  usecaseCategories,
  UsecaseTokenKind as T,
  usecaseTokens,
} from '@mermaid-js/diagram-usecase/language';
import { agreement, corpus, highlighters, ROOT } from './agreement-testing.ts';

/**
 * Cases of `packages/conformance/corpus/usecase-cases.json` for the kinds the e2e corpus lacks:
 * unclosed Markdown, JSON and stereotypes, `TD`/`TB`, `json` that declares nothing, `{`,
 * numbers, label punctuation (`\,`, `.`, `%`, `!#$&*+/=?^|~`, `;<>`), `-` and a directive.
 */
const CASES = [
  'usecase-cases/strings-markdown-unclosed',
  'usecase-cases/json-unclosed',
  'usecase-cases/keywords-whole',
  'usecase-cases/json-not-declaration',
  'usecase-cases/stereotype-unclosed',
  'usecase-cases/numbers',
  'usecase-cases/labels-punctuation',
  'usecase-cases/ids-css-identifier',
  'usecase-cases/strings-percent',
  'usecase-cases/directive-first',
];

function cases(): [string, string][] {
  const file = join(ROOT, 'packages/conformance/corpus/usecase-cases.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as { id: string; source: string }[];
  return CASES.map((id) => {
    const found = all.find((c) => c.id === id);
    if (!found) throw new Error(`no case ${id} in usecase-cases.json`);
    return [id, found.source];
  });
}

const E2E = '/e2e/diagrams/usecase/nightly-check/';
const ENTITY_NAMES = '/e2e/diagrams/usecase/baseline/text/entity-names.mmd';

/**
 * Entity codes such as `#colon;` and `#amp;` (first in this fixture, also in
 * `nightly-check/parser-entities.mmd`): v12's `encodeEntities` turned each code into a
 * placeholder before lexing (`ﬂ°colon¶ß`, a `LABEL_SYMBOL`, a word and a `LABEL_SYMBOL`), which is
 * what the lexer reads (pitfall 1). The highlighters see the source, `#colon;`: a colour `#co…`
 * and punctuation, in all three.
 */
const ENTITIES = Object.fromEntries(
  ['Lezer', 'Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: Identifier is Variable, highlighted Constant`, `${ENTITY_NAMES} at 195`],
    [`${h}: LabelSymbol is Other, highlighted Constant`, `${ENTITY_NAMES} at 194`],
    [`${h}: LabelSymbol is Other, highlighted Punctuation`, `${ENTITY_NAMES} at 200`],
  ])
);

/**
 * A multi-line `accDescr { … }` and a multi-line JSON object (closed or not) are one token each. TextMate and
 * Monarch, which read a line at a time, cannot follow them over their line breaks (Lezer, which
 * runs the patterns, agrees), as for pie, radar and wardley.
 */
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [
      `${h}: AccDescrBlock is Keyword, highlighted Punctuation`,
      `${E2E}10-configuration-and-accessibility.mmd at 567`,
    ],
    [
      `${h}: AccDescrBlock is Keyword, highlighted Variable`,
      `${E2E}10-configuration-and-accessibility.mmd at 558`,
    ],
    [
      `${h}: JsonObjectLiteral is String, highlighted Constant`,
      `${E2E}16-json-order-and-values.mmd at 409`,
    ],
    [
      `${h}: JsonObjectLiteral is String, highlighted Number`,
      `${E2E}20-full-featured-order-system.mmd at 961`,
    ],
    [
      `${h}: JsonObjectLiteral is String, highlighted Punctuation`,
      `${E2E}08-json-table.mmd at 331`,
    ],
    [
      `${h}: UnclosedJsonObjectLiteral is String, highlighted Keyword`,
      'usecase-cases/json-unclosed at 37',
    ],
    [
      `${h}: UnclosedJsonObjectLiteral is String, highlighted Punctuation`,
      'usecase-cases/json-unclosed at 33',
    ],
    [
      `${h}: UnclosedJsonObjectLiteral is String, highlighted Variable`,
      'usecase-cases/json-unclosed at 35',
    ],
    [
      `${h}: JsonObjectLiteral is String, highlighted Variable`,
      `${E2E}16-json-order-and-values.mmd at 428`,
    ],
  ])
);

/**
 * `Ärlig`: the lexer, Monarch and Lezer read `Ä` as a `LABEL_SYMBOL` and `rlig` as an id (v12's
 * `\w` is ASCII); TextMate's Oniguruma `\w` takes the `Ä` into the word.
 */
const UNICODE_WORD = {
  'TextMate: LabelSymbol is Other, highlighted Variable': 'usecase-cases/labels-punctuation at 32',
};

describe('four-way highlighting agreement (usecase)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    // Most fixtures start with front matter; the header follows it.
    const sources = corpus((src) => detectUsecase(src.slice(preprocess(src).bodyStart)));
    expect(sources.length).toBeGreaterThan(30);
    const result = agreement(
      { kinds: T, categories: usecaseCategories, tokens: usecaseTokens },
      await highlighters('usecase'),
      [...cases(), ...sources]
    );
    expect(result.disagreements).toEqual({ ...ENTITIES, ...LINE_BASED, ...UNICODE_WORD });
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
