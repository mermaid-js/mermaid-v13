/** The agentflow grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';
import { agentflowLexerInput } from './lexer-input.ts';

export const AGENTFLOW_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-agentflow/grammar/agentflow.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function agentflowGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(AGENTFLOW_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/** jison names of the two terminals whose names are not identifiers. */
const JISON_NAME: Record<string, string> = { ELLIPSE_START: '(-', ELLIPSE_END: '-)' };

export interface GrammarTokens {
  input: MappedText;
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/** The grammar lexer's tokens for an agentflow source. */
export function grammarTokens(source: string): GrammarTokens {
  const input = agentflowLexerInput(source);
  const { tokens, error } = agentflowGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [JISON_NAME[k.name] ?? k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
