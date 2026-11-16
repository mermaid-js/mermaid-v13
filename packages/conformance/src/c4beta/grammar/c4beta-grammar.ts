/** The c4-beta grammar file, read and built once, and its lexer's tokens (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, ModeLexer } from '@mermaid-js/gen-grammar';
import { preprocess } from '@mermaid-js/core/preprocess';
import { REPO_ROOT } from '../../corpus.ts';

export const C4BETA_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-c4/grammar/c4beta.ebnf');

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function c4betaGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(C4BETA_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/** Lexer tokens the parser skips. */
export const HIDDEN = new Set(['COMMENT']);

export interface GrammarTokens {
  /** The text the lexer read: the source with front matter and directives blanked out. */
  text: string;
  /** Every token, hidden ones and the final `EOF` included. */
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/** `src` with the characters of `ranges` replaced by blanks, so every offset stays. */
function blanked(src: string, ranges: readonly { start: number; end: number }[]): string {
  let out = src;
  for (const { start, end } of ranges) {
    out = out.slice(0, start) + ' '.repeat(end - start) + out.slice(end);
  }
  return out;
}

/**
 * The grammar lexer's tokens for a source. Its input is the source with the front matter and
 * the directives core found blanked out (see the header of `grammar/c4beta.ebnf`).
 */
export function grammarTokens(source: string): GrammarTokens {
  const pre = preprocess(source);
  const text = blanked(source, [
    { start: 0, end: pre.bodyStart },
    ...pre.directives.map((d) => d.range),
  ]);
  const { tokens, error } = c4betaGrammar().lexer.lex(text);
  return { text, tokens, error };
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(t: GrammarTokens): LexToken[] {
  return t.tokens.filter((k) => !HIDDEN.has(k.name));
}
