/** The sequence grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const SEQUENCE_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-sequence/grammar/sequence.ebnf'
);

export function sequenceGrammar(): LoadedGrammar {
  return loadGrammar(SEQUENCE_GRAMMAR_PATH);
}

/**
 * jison names of the terminals the grammar file names differently: those whose jison name is
 * not an identifier, and the rules jison returned `NEWLINE` from.
 */
const JISON_NAME: Record<string, string> = {
  COMMA: ',',
  PLUS: '+',
  MINUS: '-',
  PARENS: '()',
  SEMI: 'NEWLINE',
  ALIAS_END: 'NEWLINE',
  EOF: 'NEWLINE',
};

/** jison trimmed the image of these (`yytext = yytext.trim()`). */
const TRIMMED = new Set(['ACTOR', 'INVALID']);

/** The grammar lexer's tokens for a sequence source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(sequenceGrammar(), classLexerInput(source));
}

/** The same tokens as jison `[name, image]` pairs, `['LEXICAL_ERROR', '']` after an error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [
    JISON_NAME[k.name] ?? k.name,
    TRIMMED.has(k.name) ? k.text.trim() : k.text,
  ]);
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
