/** The wardley grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const WARDLEY_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-wardley/grammar/wardley.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function wardleyGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(WARDLEY_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/** Chevrotain names (`@mermaid-js/parser@2.0.1`) of the terminals the grammar names otherwise. */
export const LANGIUM_NAME: Readonly<Record<string, string>> = {
  LBRACKET: '[',
  COMMA: ',',
  RBRACKET: ']',
  AT: '@',
  SLASH: '/',
  LPAREN: '(',
  RPAREN: ')',
  DASH: '-',
  LBRACE: '{',
  RBRACE: '}',
  DECIMAL: 'WARDLEY_NUMBER',
  WARDLEY_BETA: 'KW_WARDLEY',
  SIZE: 'KW_SIZE',
  EVOLUTION: 'KW_EVOLUTION',
  ANCHOR: 'KW_ANCHOR',
  COMPONENT: 'KW_COMPONENT',
  LABEL: 'KW_LABEL',
  INERTIA: 'KW_INERTIA',
  EVOLVE: 'KW_EVOLVE',
  PIPELINE: 'KW_PIPELINE',
  NOTE: 'KW_NOTE',
  ANNOTATIONS: 'KW_ANNOTATIONS',
  ANNOTATION: 'KW_ANNOTATION',
  ACCELERATOR: 'KW_ACCELERATOR',
  DEACCELERATOR: 'KW_DEACCELERATOR',
  NAME: 'NAME_WITH_SPACES',
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
 * The grammar lexer's tokens for a wardley source. Its input is the text v12 handed its parser:
 * v12 ran the same preprocessing and `encodeEntities` for every diagram, so ER's reference
 * builder serves (the grammar-lexer spec checks it against v12's captured text).
 */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = wardleyGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(t: GrammarTokens): LexToken[] {
  return t.tokens.filter((k) => !HIDDEN.has(k.name));
}
