/** The sankey grammar file, read and built once (dev and CI only). */
import { join } from 'node:path';
import { replaceMapped, sliceMapped } from '@mermaid-js/gen-grammar';
import type { MappedText } from '@mermaid-js/gen-grammar';
import { loadGrammar, lexGrammar } from '../../grammar-file.ts';
import type { LoadedGrammar, GrammarTokens } from '../../grammar-file.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';
import { REPO_ROOT } from '../../corpus.ts';
import { LEXICAL_ERROR } from '../../jison/oracle.ts';
import type { JisonToken } from '../../jison/oracle.ts';

export const SANKEY_GRAMMAR_PATH = join(REPO_ROOT, 'packages/diagram-sankey/grammar/sankey.ebnf');

export function sankeyGrammar(): LoadedGrammar {
  return loadGrammar(SANKEY_GRAMMAR_PATH);
}

/**
 * `m` without the characters `drop` takes at either end. Sliced, not replaced: a replacement
 * would extend the last kept character over the text it drops, a comment line included.
 */
function trimMapped(m: MappedText, drop: RegExp): MappedText {
  let lo = 0;
  let hi = m.text.length;
  while (lo < hi && drop.test(m.text.charAt(lo))) lo++;
  while (hi > lo && drop.test(m.text.charAt(hi - 1))) hi--;
  const kept = sliceMapped(m, lo);
  const n = hi - lo;
  return { text: kept.text.slice(0, n), from: kept.from.slice(0, n), to: kept.to.slice(0, n) };
}

/**
 * The lexer input (see the header of `grammar/sankey.ebnf`): class's, as v12's preprocessing is
 * the same for every jison type, then sankey's `prepareTextForParsing` (`sankeyUtils.ts`):
 * blanks off both ends (`/^[^\S\n\r]+|[^\S\n\r]+$/g`), each run of line breaks as one
 * (`/([\n\r])+/g`), then `trim()` (`\s` off both ends), which also takes v12's appended `\n`
 * off again.
 */
export function sankeyLexerInput(source: string): MappedText {
  let m = trimMapped(classLexerInput(source), /[^\S\n\r]/);
  m = replaceMapped(m, /([\n\r])+/g, () => '\n');
  return trimMapped(m, /\s/);
}

/** The grammar lexer's tokens for a sankey source. */
export function grammarTokens(source: string): GrammarTokens {
  return lexGrammar(sankeyGrammar(), sankeyLexerInput(source));
}

const TEXT = new Set(['NON_ESCAPED_TEXT', 'ESCAPED_TEXT']);

/**
 * A jison stream with its stall cut (see `../lexer-parity.spec.ts`): on a character outside
 * printable ASCII, `{TEXTDATA}*` and `ESCAPED_TEXT` match the empty string forever. The stream
 * is cut at the first empty text token that is not the last and ended with `LEXICAL_ERROR`.
 */
export function cutStall(tokens: readonly JisonToken[]): JisonToken[] {
  const at = tokens.findIndex(
    ([name, image], j) => image === '' && TEXT.has(name) && j < tokens.length - 1
  );
  if (at < 0) return [...tokens];
  return [...tokens.slice(0, at), [LEXICAL_ERROR, '']];
}

/**
 * The same tokens as jison `[name, image]` pairs (the grammar names them as jison does), the
 * stall cut as {@link cutStall} cuts v12's. The grammar lexer gives up on a stall after three
 * empty tokens; that is the only way it fails, as some rule matches the empty string in every
 * mode.
 */
export function asJison(t: GrammarTokens): JisonToken[] {
  const out = t.tokens.map((k): JisonToken => [k.name, k.text]);
  if (t.error !== undefined) out.push([LEXICAL_ERROR, '']);
  return cutStall(out);
}
