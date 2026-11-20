/** The packet grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const PACKET_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-packet/grammar/packet.ebnf');

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function packetGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(PACKET_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/** Chevrotain names (`@mermaid-js/parser@2.0.1`) of the terminals the grammar names otherwise. */
export const LANGIUM_NAME: Readonly<Record<string, string>> = {
  PACKET_BETA: 'packet-beta',
  PACKET: 'packet',
  DASH: '-',
  PLUS: '+',
  COLON: ':',
  COMMENT: 'SINGLE_LINE_COMMENT',
};

/** Lexer tokens the parser skips: Langium's hidden group. */
export const HIDDEN = new Set(['YAML', 'DIRECTIVE', 'COMMENT']);

export interface GrammarTokens {
  input: MappedText;
  /** Every token, hidden ones and the final `EOF` included. */
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/**
 * The grammar lexer's tokens for a packet source. Its input is the text v12 handed its parser:
 * v12 ran the same preprocessing and `encodeEntities` for every diagram, so ER's reference
 * builder serves (the grammar-lexer spec checks it against v12's captured text).
 */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = packetGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(t: GrammarTokens): LexToken[] {
  return t.tokens.filter((k) => !HIDDEN.has(k.name));
}
