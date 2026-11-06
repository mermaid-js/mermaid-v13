/** The gantt grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';

export const GANTT_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-gantt/grammar/gantt.ebnf');

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function ganttGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(GANTT_GRAMMAR_PATH, 'utf8'));
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
 * The grammar lexer's tokens for a gantt source. The lexer input is class's (see the header of
 * `grammar/gantt.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = ganttGrammar().lexer.lex(input.text);
  return { input, tokens, error };
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
  const images = t.tokens.map((k) => k.text);
  for (let k = t.tokens.length - 1; k >= 0; k--) {
    const tok = t.tokens[k];
    if (!tok || tok.end < t.input.text.length) break;
    if (tok.start === tok.end) continue;
    if (tok.text.endsWith('\n')) images[k] = tok.text.slice(0, -1);
    break;
  }
  const out: [string, string][] = [];
  t.tokens.forEach((k, i) => {
    if (!NO_JISON_TOKEN.has(k.name)) out.push([JISON_NAME[k.name] ?? k.name, images[i] ?? '']);
  });
  if (t.error !== undefined) out.push(['LEXICAL_ERROR', '']);
  return out;
}
