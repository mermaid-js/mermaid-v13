/** The sequence grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { sequenceLexerInput } from './lexer-input.ts';

export const SEQUENCE_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-sequence/grammar/sequence.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function sequenceGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(SEQUENCE_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
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

export interface GrammarTokens {
  input: MappedText;
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/** The grammar lexer's tokens for a sequence source. */
export function grammarTokens(source: string): GrammarTokens {
  const input = sequenceLexerInput(source);
  const { tokens, error } = sequenceGrammar().lexer.lex(input.text);
  return { input, tokens, error };
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
