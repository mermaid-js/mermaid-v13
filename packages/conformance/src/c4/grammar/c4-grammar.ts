/** The C4 grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar, jisonImages } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';

export const C4_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-c4/grammar/c4.ebnf');

export function c4Grammar(): LoadedGrammar {
  return loadGrammar(C4_GRAMMAR_PATH);
}

/**
 * The grammar lexer's tokens for a C4 source. The lexer input is class's (see the header of
 * `grammar/c4.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(c4Grammar(), classLexerInput(source));
}

/**
 * Tokens the grammar names although jison returned none for them: a `%%` comment (the parser's
 * trivia; named so the grammar can join the line breaks around a bare `%%` line) and the `)`
 * closing the arguments (which D452 makes the only way out of them but a line break).
 */
export const GRAMMAR_ONLY: ReadonlySet<string> = new Set(['COMMENT', 'ARGS_CLOSE']);

/**
 * The same tokens as jison `[name, image]` pairs, without {@link GRAMMAR_ONLY}'s, and
 * `['LEXICAL_ERROR', '']` after an error. The oracle takes v12's appended `\n` off the token
 * that matched it, so the final `\n` comes off the image of the last non-empty token that ends
 * at the end of the input.
 */
export function asJison(t: GrammarTokens): [string, string][] {
  const images = jisonImages(t);
  const out: [string, string][] = [];
  t.tokens.forEach((k, i) => {
    if (!GRAMMAR_ONLY.has(k.name)) out.push([k.name, images[i] ?? '']);
  });
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
