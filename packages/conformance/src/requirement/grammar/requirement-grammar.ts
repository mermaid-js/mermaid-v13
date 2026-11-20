/** The requirement grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { loadGrammar, lexGrammar, jisonImages } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { LEXICAL_ERROR } from '../../jison/oracle.ts';
import type { JisonToken } from '../../jison/oracle.ts';

export const REQUIREMENT_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-requirement/grammar/requirement.ebnf'
);

export function requirementGrammar(): LoadedGrammar {
  return loadGrammar(REQUIREMENT_GRAMMAR_PATH);
}

/**
 * The grammar lexer's tokens for a requirement source. The lexer input is class's (see the
 * header of `grammar/requirement.ebnf`): v12's preprocessing is the same for every jison type.
 */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(requirementGrammar(), classLexerInput(source));
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
  const images = jisonImages(t);
  const out = t.tokens.map((k, i): JisonToken => {
    const image = images[i] ?? '';
    if (k.name === 'NEWLINE_AFTER_BLANK') return ['NEWLINE', image.replace(/^[^\S\n]+/, '')];
    if (k.name === 'unqString') return [k.name, image.trim()];
    return [k.name, image];
  });
  if (t.error !== undefined) out.push([LEXICAL_ERROR, '']);
  return out;
}
