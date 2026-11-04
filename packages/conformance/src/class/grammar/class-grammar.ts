/** The class grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from './lexer-input.ts';

export const CLASS_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-class/grammar/class.ebnf');

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function classGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(CLASS_GRAMMAR_PATH, 'utf8'));
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

/** The grammar lexer's tokens for a class source. */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = classGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
