/**
 * A type's grammar file, read and built once, and what its lexer makes of a source: the part
 * every `src/<type>/grammar/<type>-grammar.ts` shares (dev and CI only).
 */
import { readFileSync } from 'node:fs';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';

/** A grammar file and the lexer built from it. */
export interface LoadedGrammar {
  grammar: Grammar;
  lexer: ModeLexer;
}

/** Built grammars by file path. */
const loaded = new Map<string, LoadedGrammar>();

/** The grammar file at `path`, read and built on the first call. */
export function loadGrammar(path: string): LoadedGrammar {
  let built = loaded.get(path);
  if (!built) {
    const grammar = parseGrammar(readFileSync(path, 'utf8'));
    built = { grammar, lexer: buildLexer(grammar) };
    loaded.set(path, built);
  }
  return built;
}

export interface GrammarTokens {
  /** The lexer input, mapped to the source. */
  input: MappedText;
  /** Every token, hidden ones and (where the grammar has one) the final `EOF` included. */
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/** The grammar lexer's tokens for `input`, the type's lexer input for a source. */
export function lexGrammar(grammar: LoadedGrammar, input: MappedText): GrammarTokens {
  const { tokens, error } = grammar.lexer.lex(input.text);
  return { input, tokens, error };
}

/**
 * The tokens' texts as the images jison gave them, before any action rewrote them. The oracle
 * takes v12's appended `\n` off the token that matched it, so the final `\n` comes off the
 * image of the last non-empty token that ends at the end of the input.
 */
export function jisonImages(t: GrammarTokens): string[] {
  const images = t.tokens.map((k) => k.text);
  for (let k = t.tokens.length - 1; k >= 0; k--) {
    const tok = t.tokens[k];
    if (!tok || tok.end < t.input.text.length) break;
    if (tok.start === tok.end) continue;
    if (tok.text.endsWith('\n')) images[k] = tok.text.slice(0, -1);
    break;
  }
  return images;
}
