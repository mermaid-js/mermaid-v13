// cspell:words QMARK
/** The ER grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const ER_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-er/grammar/er.ebnf');

export function erGrammar(): LoadedGrammar {
  return loadGrammar(ER_GRAMMAR_PATH);
}

/**
 * jison names of the terminals the grammar names differently: jison's `.` rule returns the
 * character itself (`?`, `,` in a block), and the attribute comment is jison's `COMMENT`.
 */
const JISON_NAME: Record<string, string> = {
  QMARK: '?',
  BLOCK_COMMA: ',',
  ATTRIBUTE_COMMENT: 'COMMENT',
};

/** The grammar lexer's tokens for an ER source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(erGrammar(), classLexerInput(source));
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [
    k.name === 'CHAR' ? k.text : (JISON_NAME[k.name] ?? k.name),
    k.text,
  ]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
