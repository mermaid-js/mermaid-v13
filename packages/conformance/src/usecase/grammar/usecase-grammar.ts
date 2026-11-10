/** The usecase grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { lexText, usecaseView } from '@mermaid-js/diagram-usecase/testing';
import { REPO_ROOT } from '../../corpus.ts';

export const USECASE_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-usecase/grammar/usecase.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function usecaseGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(USECASE_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/**
 * Chevrotain names of the terminals the grammar splits or names otherwise: exactly `--` and
 * `<--` (which may start a label), the PlantUML words (ids that start no statement) and the
 * decimals that win over an id.
 */
export const CHEVROTAIN_NAME: Readonly<Record<string, string>> = {
  LABEL_SOLID: 'MARKERLESS_SOLID',
  BACKWARD_LABEL_SOLID: 'BACKWARD_SOLID',
  PLANTUML: 'IDENTIFIER',
};

export interface GrammarTokens {
  input: MappedText;
  /** Every token, the final `EOF` included. */
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/**
 * The grammar lexer's tokens for a usecase source. Its input is the text v12's lexer received,
 * built by the lexer gate's `lexText` (#562), which the gate checks against v12's captured text.
 */
export function grammarTokens(source: string): GrammarTokens {
  const { bodyStart, view } = usecaseView(source);
  const input = lexText(source, bodyStart, view);
  const n = input.text.length;
  const from: number[] = [];
  const to: number[] = [];
  for (let k = 0; k < n; k++) {
    from.push(input.start(k));
    to.push(input.end(k));
  }
  const mapped: MappedText = { text: input.text, from, to };
  const { tokens, error } = usecaseGrammar().lexer.lex(input.text);
  return { input: mapped, tokens, error };
}
