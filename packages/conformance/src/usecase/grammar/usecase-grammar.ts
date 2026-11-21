/** The usecase grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import type { MappedText } from '@mermaid-js/gen-grammar';
import { lexGrammar, loadGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { lexText, usecaseView } from '@mermaid-js/diagram-usecase/testing';
import { REPO_ROOT } from '../../corpus.ts';

export const USECASE_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-usecase/grammar/usecase.ebnf'
);

export function usecaseGrammar(): LoadedGrammar {
  return loadGrammar(USECASE_GRAMMAR_PATH);
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
  return lexGrammar(usecaseGrammar(), mapped);
}
