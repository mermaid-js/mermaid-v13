/** The requirement grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLexer, parseGrammar } from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { LEXICAL_ERROR } from '../../jison/oracle.ts';
import type { JisonToken } from '../../jison/oracle.ts';

export const REQUIREMENT_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-requirement/grammar/requirement.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function requirementGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(REQUIREMENT_GRAMMAR_PATH, 'utf8'));
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
 * The grammar lexer's tokens for a requirement source. The lexer input is class's (see the
 * header of `grammar/requirement.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  const input = classLexerInput(source);
  const { tokens, error } = requirementGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/**
 * The same tokens as jison `[name, image]` pairs, as v12's lexer with D431's and D432's rules
 * (`DECIDED_RULES`) returns them: `NEWLINE_AFTER_BLANK` is a `NEWLINE` whose blanks the decided
 * `\s` rule skipped (they come off its image), and an `unqString` image is trimmed (jison's
 * `yytext.trim()`). The oracle takes v12's appended `\n` off the token that matched it, so the
 * final `\n` comes off the image of the last non-empty token that ends at the end of the input.
 * `['LEXICAL_ERROR', '']` after an error.
 */
export function asJison(t: GrammarTokens): JisonToken[] {
  const images = t.tokens.map((k) => k.text);
  for (let k = t.tokens.length - 1; k >= 0; k--) {
    const tok = t.tokens[k];
    if (!tok || tok.end < t.input.text.length) break;
    if (tok.start === tok.end) continue;
    if (tok.text.endsWith('\n')) images[k] = tok.text.slice(0, -1);
    break;
  }
  const out = t.tokens.map((k, i): JisonToken => {
    const image = images[i] ?? '';
    if (k.name === 'NEWLINE_AFTER_BLANK') return ['NEWLINE', image.replace(/^[^\S\n]+/, '')];
    if (k.name === 'unqString') return [k.name, image.trim()];
    return [k.name, image];
  });
  if (t.error !== undefined) out.push([LEXICAL_ERROR, '']);
  return out;
}
