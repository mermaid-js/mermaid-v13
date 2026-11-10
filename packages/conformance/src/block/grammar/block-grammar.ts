/** The block grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';

export const BLOCK_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-block/grammar/block.ebnf');

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function blockGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(BLOCK_GRAMMAR_PATH, 'utf8'));
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
 * The grammar lexer's tokens for a block source. The lexer input is class's (see the header of
 * `grammar/block.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = blockGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/**
 * The image jison's action left for a token the grammar matched as `text` (the grammar has no
 * actions that rewrite text): `columns 3` is `3` and `columns auto` `-1`, `space` is `1` and
 * `space:3` `3`, `:3` is `3`, a direction drops a leading comma and the blanks after it, and the
 * `)` closing a block arrow is `]>`.
 */
function image(name: string, text: string): string {
  switch (name) {
    case 'COLUMNS': {
      const value = text.replace(/^columns\s+/, '');
      return value === 'auto' ? '-1' : value;
    }
    case 'SPACE_BLOCK':
      return text === 'space' ? '1' : text.replace(/^space:/, '');
    case 'SIZE':
      return text.slice(1);
    case 'DIR':
      return text.replace(/^,\s*/, '');
    case 'BLOCK_ARROW_END':
      return ']>';
    default:
      return text;
  }
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
  const out: [string, string][] = t.tokens.map((k, i) => [k.name, image(k.name, images[i] ?? '')]);
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
