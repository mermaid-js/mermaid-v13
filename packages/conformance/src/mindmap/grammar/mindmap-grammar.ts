/** The mindmap grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar, jisonImages } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';

export const MINDMAP_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-mindmap/grammar/mindmap.ebnf'
);

export function mindmapGrammar(): LoadedGrammar {
  return loadGrammar(MINDMAP_GRAMMAR_PATH);
}

/**
 * The grammar lexer's tokens for a mindmap source. The lexer input is class's (see the header
 * of `grammar/mindmap.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(mindmapGrammar(), classLexerInput(source));
}

/**
 * The same tokens as jison `[name, image]` pairs (the grammar names them as jison does; its
 * unnamed rules are the text jison returned no token for), `['LEXICAL_ERROR', '']` after an
 * error. The oracle takes v12's appended `\n` off the token that matched it, so the final `\n`
 * comes off the image of the last non-empty token that ends at the end of the input.
 */
export function asJison(t: GrammarTokens): [string, string][] {
  const images = jisonImages(t);
  const out: [string, string][] = t.tokens.map((k, i) => [k.name, images[i] ?? '']);
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
