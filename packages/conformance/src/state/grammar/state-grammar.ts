/** The state grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const STATE_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-state/grammar/state.ebnf');

export function stateGrammar(): LoadedGrammar {
  return loadGrammar(STATE_GRAMMAR_PATH);
}

/** jison names of the terminals whose names are not identifiers or differ in spelling. */
const JISON_NAME: Record<string, string> = {
  END_OF_INPUT: 'NL',
  ARROW: '-->',
  COMPOSITE_STATE: 'COMPOSIT_STATE',
  MULTI_WORD_STATE: 'ERROR',
};

/** The grammar lexer's tokens for a state source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(stateGrammar(), classLexerInput(source));
}

/**
 * The image jison's action gave a token (the grammar has no actions): pseudo-state names and
 * descriptions trimmed, `: text` note text past its first two characters (`substr(2)`).
 */
function jisonImage(name: string, text: string, prev: string | undefined): string {
  if (name === 'FORK' || name === 'JOIN' || name === 'CHOICE' || name === 'DESCR')
    return text.trim();
  if (name === 'NOTE_TEXT' && prev === 'ID') {
    return /^\s*:/.test(text) ? text.substring(2).trim() : text.trim();
  }
  return text;
}

/**
 * The same tokens as jison `[name, image]` pairs, cut at the first error with `['ERROR', '']`.
 * The line break v12 appended is taken off the image of a token that ends there, as the
 * lexer oracle does.
 */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = [];
  const end = t.input.text.length;
  let prev: string | undefined;
  for (const k of t.tokens) {
    const name = JISON_NAME[k.name] ?? k.name;
    if (name === 'ERROR') {
      out.push(['ERROR', '']);
      return out;
    }
    let image = jisonImage(k.name, k.text, prev);
    if (k.end === end && image.endsWith('\n')) image = image.slice(0, -1);
    out.push([name, image]);
    prev = name;
  }
  if (t.error !== undefined) out.push(['ERROR', '']);
  return out;
}
