/** The ishikawa grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';

export const ISHIKAWA_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-ishikawa/grammar/ishikawa.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function ishikawaGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(ISHIKAWA_GRAMMAR_PATH, 'utf8'));
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
 * The grammar lexer's tokens for an ishikawa source. The lexer input is class's (see the header
 * of `grammar/ishikawa.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = ishikawaGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/**
 * The same tokens as jison `[name, image]` pairs (the grammar names them as jison does; its
 * unnamed rules are the text jison returned no token for), `['LEXICAL_ERROR', '']` after an
 * error. The oracle takes v12's appended `\n` off the token that matched it, so the final `\n`
 * comes off the image of the last non-empty token that ends at the end of the input.
 */
export function asJison(t: GrammarTokens): [string, string][] {
  const images = t.tokens.map((k) => k.text);
  for (let k = t.tokens.length - 1; k >= 0; k--) {
    const tok = t.tokens[k];
    if (!tok || tok.end < t.input.text.length) break;
    if (tok.start === tok.end) continue;
    if (tok.text.endsWith('\n')) images[k] = tok.text.slice(0, -1);
    break;
  }
  const out: [string, string][] = t.tokens.map((k, i) => [k.name, images[i] ?? '']);
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
