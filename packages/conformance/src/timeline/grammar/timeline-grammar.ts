/** The timeline grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';

export const TIMELINE_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-timeline/grammar/timeline.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function timelineGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(TIMELINE_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

export interface GrammarTokens {
  input: MappedText;
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/**
 * The grammar lexer's tokens for a timeline source. The lexer input is class's (see the header
 * of `grammar/timeline.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = timelineGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/**
 * The same tokens as jison `[name, image]` pairs (the grammar names them as jison does),
 * `['LEXICAL_ERROR', '']` after an error.
 */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [k.name, k.text]);
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
