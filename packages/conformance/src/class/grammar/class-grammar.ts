/** The class grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from './lexer-input.ts';

export const CLASS_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-class/grammar/class.ebnf');

export function classGrammar(): LoadedGrammar {
  return loadGrammar(CLASS_GRAMMAR_PATH);
}

/** The grammar lexer's tokens for a class source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(classGrammar(), classLexerInput(source));
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
