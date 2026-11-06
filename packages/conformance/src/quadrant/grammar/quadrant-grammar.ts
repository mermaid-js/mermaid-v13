/** The quadrant grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { quadrantLexerInput } from './lexer-input.ts';

export const QUADRANT_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-quadrant/grammar/quadrant.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function quadrantGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(QUADRANT_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/** jison names of the terminals the grammar spells with `_` (grammar names are identifiers). */
const JISON_NAME: Record<string, string> = {
  X_AXIS: 'X-AXIS',
  Y_AXIS: 'Y-AXIS',
  AXIS_TEXT_DELIMITER: 'AXIS-TEXT-DELIMITER',
};

export interface GrammarTokens {
  input: MappedText;
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/** The grammar lexer's tokens for a quadrant source. */
export function grammarTokens(source: string): GrammarTokens {
  const input = quadrantLexerInput(source);
  const { tokens, error } = quadrantGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [JISON_NAME[k.name] ?? k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
