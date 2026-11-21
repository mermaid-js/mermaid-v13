/** The gantt grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar, jisonImages } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';

export const GANTT_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-gantt/grammar/gantt.ebnf');

export function ganttGrammar(): LoadedGrammar {
  return loadGrammar(GANTT_GRAMMAR_PATH);
}

/**
 * The grammar lexer's tokens for a gantt source. The lexer input is class's (see the header of
 * `grammar/gantt.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(ganttGrammar(), classLexerInput(source));
}

/** The openers and closers of jison's start conditions: jison matched them and returned none. */
const NO_JISON_TOKEN = new Set([
  'acc_descr_multiline',
  'acc_descr_multiline_end',
  'href_keyword',
  'href_end',
  'call_keyword',
  'callback_empty_args',
  'callback_args_open',
  'callback_args_close',
  'click_keyword',
  'click_end',
]);
/** Grammar names that are not identifiers, or that a kind name had to match (`categories.ts`). */
const JISON_NAME: Readonly<Record<string, string>> = {
  task_text: 'taskTxt',
  colon: ':',
  click_id: 'click',
};

/**
 * The same tokens as jison `[name, image]` pairs (the grammar names them as jison does, less
 * the ones jison returned none for), `['LEXICAL_ERROR', '']` after an error. The oracle takes
 * v12's appended `\n` off the token that matched it, so the final `\n` comes off the image of
 * the last non-empty token that ends at the end of the input.
 */
export function asJison(t: GrammarTokens): [string, string][] {
  const images = jisonImages(t);
  const out: [string, string][] = [];
  t.tokens.forEach((k, i) => {
    if (!NO_JISON_TOKEN.has(k.name)) out.push([JISON_NAME[k.name] ?? k.name, images[i] ?? '']);
  });
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
