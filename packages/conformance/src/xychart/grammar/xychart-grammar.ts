/** The XY chart grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const XYCHART_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-xychart/grammar/xychart.ebnf'
);

export function xyChartGrammar(): LoadedGrammar {
  return loadGrammar(XYCHART_GRAMMAR_PATH);
}

/** The grammar lexer's tokens for an XY chart source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(xyChartGrammar(), classLexerInput(source));
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
