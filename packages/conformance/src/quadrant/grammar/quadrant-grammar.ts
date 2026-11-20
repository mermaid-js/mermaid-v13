/** The quadrant grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const QUADRANT_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-quadrant/grammar/quadrant.ebnf'
);

export function quadrantGrammar(): LoadedGrammar {
  return loadGrammar(QUADRANT_GRAMMAR_PATH);
}

/** jison names of the terminals the grammar spells with `_` (grammar names are identifiers). */
const JISON_NAME: Record<string, string> = {
  X_AXIS: 'X-AXIS',
  Y_AXIS: 'Y-AXIS',
  AXIS_TEXT_DELIMITER: 'AXIS-TEXT-DELIMITER',
};

/** The grammar lexer's tokens for a quadrant source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(quadrantGrammar(), classLexerInput(source));
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [JISON_NAME[k.name] ?? k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
