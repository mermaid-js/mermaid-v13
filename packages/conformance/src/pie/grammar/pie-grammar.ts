/** The pie grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import type { LexToken } from '@mermaid-js/gen-grammar';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const PIE_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-pie/grammar/pie.ebnf');

export function pieGrammar(): LoadedGrammar {
  return loadGrammar(PIE_GRAMMAR_PATH);
}

/** Chevrotain names (`@mermaid-js/parser@2.0.1`) of the terminals the grammar names otherwise. */
export const LANGIUM_NAME: Readonly<Record<string, string>> = {
  SHOW_DATA: 'showData',
  PIE: 'pie',
  COLON: ':',
  NUMBER: 'NUMBER_PIE',
  COMMENT: 'SINGLE_LINE_COMMENT',
};

/** Lexer tokens the parser skips: Langium's hidden group. */
export const HIDDEN = new Set(['YAML', 'DIRECTIVE', 'COMMENT']);

/**
 * The grammar lexer's tokens for a pie source. Its input is the text v12 handed its parser:
 * v12 ran the same preprocessing and `encodeEntities` for every diagram, so ER's reference
 * builder serves (the grammar-lexer spec checks it against v12's captured text).
 */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(pieGrammar(), classLexerInput(source));
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(t: GrammarTokens): LexToken[] {
  return t.tokens.filter((k) => !HIDDEN.has(k.name));
}
