/** The journey grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const JOURNEY_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-journey/grammar/journey.ebnf'
);

export function journeyGrammar(): LoadedGrammar {
  return loadGrammar(JOURNEY_GRAMMAR_PATH);
}

/** jison names of the terminals the grammar spells as identifiers. */
const JISON_NAME: Record<string, string> = { COLON: ':' };

/** The grammar lexer's tokens for a journey source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(journeyGrammar(), classLexerInput(source));
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [JISON_NAME[k.name] ?? k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
