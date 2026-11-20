// cspell:words QMARK
/** The ER grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const ER_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-er/grammar/er.ebnf');

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function erGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(ER_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/**
 * jison names of the terminals the grammar names differently: jison's `.` rule returns the
 * character itself (`?`, `,` in a block), and the attribute comment is jison's `COMMENT`.
 */
const JISON_NAME: Record<string, string> = {
  QMARK: '?',
  BLOCK_COMMA: ',',
  ATTRIBUTE_COMMENT: 'COMMENT',
};

export interface GrammarTokens {
  input: MappedText;
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/** The grammar lexer's tokens for an ER source. */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = erGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [
    k.name === 'CHAR' ? k.text : (JISON_NAME[k.name] ?? k.name),
    k.text,
  ]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
