/** The treeView grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, mapped, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { erLexerInput } from '../../er/grammar/lexer-input.ts';
import { boxReference } from './box-reference.ts';

export const TREEVIEW_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-treeview/grammar/treeview.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function treeViewGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(TREEVIEW_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/** Chevrotain names (`@mermaid-js/parser@2.0.1`) of the terminals the grammar names otherwise. */
export const LANGIUM_NAME: Readonly<Record<string, string>> = {
  TREEVIEW_BETA: 'treeView-beta',
  COMMENT: 'ML_COMMENT',
};

/** Lexer tokens the parser skips: Langium's hidden group. */
export const HIDDEN = new Set(['COMMENT']);

export interface GrammarTokens {
  /**
   * The lexer input; mapped to the source unless the box pass rewrote it (then `boxed`, and
   * its offsets are the rewrite's own).
   */
  input: MappedText;
  boxed: boolean;
  /** v12's box-pass message, when it threw (nothing was lexed). */
  boxError?: string;
  /** Every token, hidden ones and the final `EOF` included. */
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/**
 * The grammar lexer's tokens for a treeView source. Its input is the text v12 handed its
 * parser (v12 ran the same preprocessing and `encodeEntities` for every diagram, so ER's
 * reference builder serves), then v12's box-drawing pass ({@link boxReference}); the
 * grammar-lexer spec checks it against the text v12's Langium lexer read.
 */
export function grammarTokens(source: string): GrammarTokens {
  const pre = erLexerInput(source);
  const box = boxReference(pre.text);
  if (box.kind === 'error') {
    return { input: pre, boxed: false, boxError: box.message, tokens: [], error: 0 };
  }
  const input = box.kind === 'rewrite' ? mapped(box.text) : pre;
  const { tokens, error } = treeViewGrammar().lexer.lex(input.text);
  return { input, boxed: box.kind === 'rewrite', tokens, error };
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(t: GrammarTokens): LexToken[] {
  return t.tokens.filter((k) => !HIDDEN.has(k.name));
}
