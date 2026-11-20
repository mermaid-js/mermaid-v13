/** The architecture grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import type { LexToken } from '@mermaid-js/gen-grammar';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const ARCHITECTURE_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-architecture/grammar/architecture.ebnf'
);

export function architectureGrammar(): LoadedGrammar {
  return loadGrammar(ARCHITECTURE_GRAMMAR_PATH);
}

/** Chevrotain names (`@mermaid-js/parser@2.0.1`) of the terminals the grammar names otherwise. */
export const LANGIUM_NAME: Readonly<Record<string, string>> = {
  ARCHITECTURE_BETA: 'architecture-beta',
  JUNCTION: 'junction',
  SERVICE: 'service',
  COLUMN: 'column',
  GROUP: 'group',
  ALIGN: 'align',
  ROW: 'row',
  DASH_DASH: '--',
  IN: 'in',
  COLON: ':',
  DASH: '-',
  DIRECTION: 'ARROW_DIRECTION',
  ICON: 'ARCH_ICON',
  LABEL: 'ARCH_TITLE',
  COMMENT: 'SINGLE_LINE_COMMENT',
};

/** Lexer tokens the parser skips: Langium's hidden group. */
export const HIDDEN = new Set(['YAML', 'DIRECTIVE', 'COMMENT']);

/**
 * The grammar lexer's tokens for an architecture source. Its input is the text v12 handed its parser:
 * v12 ran the same preprocessing and `encodeEntities` for every diagram, so ER's reference
 * builder serves (the grammar-lexer spec checks it against v12's captured text).
 */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(architectureGrammar(), classLexerInput(source));
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(t: GrammarTokens): LexToken[] {
  return t.tokens.filter((k) => !HIDDEN.has(k.name));
}
