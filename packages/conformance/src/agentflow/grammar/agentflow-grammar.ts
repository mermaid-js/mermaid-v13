/** The agentflow grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { agentflowLexerInput } from './lexer-input.ts';

export const AGENTFLOW_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-agentflow/grammar/agentflow.ebnf'
);

export function agentflowGrammar(): LoadedGrammar {
  return loadGrammar(AGENTFLOW_GRAMMAR_PATH);
}

/** jison names of the two terminals whose names are not identifiers. */
const JISON_NAME: Record<string, string> = { ELLIPSE_START: '(-', ELLIPSE_END: '-)' };

/** The grammar lexer's tokens for an agentflow source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(agentflowGrammar(), agentflowLexerInput(source));
}

/** The same tokens as jison `[name, image]` pairs, `['INVALID', '']` after a lexical error. */
export function asJison(t: GrammarTokens): [string, string][] {
  const out: [string, string][] = t.tokens.map((k) => [JISON_NAME[k.name] ?? k.name, k.text]);
  if (t.error !== undefined) out.push(['INVALID', '']);
  return out;
}
