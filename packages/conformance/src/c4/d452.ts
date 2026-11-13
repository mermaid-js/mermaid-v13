/**
 * D452's three lexing changes (#539), #683's one and #681's, as the C4 gates exclude them: the
 * lexer-parity gate (`lexer-parity.spec.ts`), the gate-variant parity (`parity.spec.ts`) and the
 * grammar specs (`grammar/`). A source is excluded when the first token where v12's jison stream
 * and v13's differ is one of them:
 * - `unquoted`: v12's `STR` runs over a `)` or a line break, where v13's unquoted argument stops
 *   (`[^,)\n]+`), or a line break leaves the arguments (the parser reports the macro open);
 * - `comment`: v13 has a `NEWLINE` right after a `%%` comment, whose line breaks v12 ate;
 * - `title`: v12's `title` took a line break (and the next line), v13's is a lone `title`;
 * - `hash` (#683, v12's fix mermaid-js/mermaid#8039): v13's `title` or `accDescription` runs
 *   over a `#` (`[^\n;]+`), where 12.2.0's stopped (`[^#\n;]+`, and the rest of the line was a
 *   lexical error) or, with the `#` first, did not match at all;
 * - `quote` (#681): v13's quoted value opens after a tab (`[ \t]*"`, where v12's `[ ]*"` left the
 *   quotes in an unquoted argument), and an unclosed one stops at the line break before a line
 *   that starts a statement, where v12's ran on to the next quote.
 */
import { c4Tokens, JISON_NAMES } from '@mermaid-js/diagram-c4';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR } from '../jison/oracle.ts';
import type { JisonLexerOracle, JisonToken } from '../jison/oracle.ts';

/** The v13 tokens with a jison name, as `[name, image]`, and where each starts and ends. */
export function v13Tokens(source: string): { tokens: JisonToken[]; ranges: [number, number][] } {
  const tokens: JisonToken[] = [];
  const ranges: [number, number][] = [];
  // Where the last token (with or without a jison name) ended.
  let end = 0;
  for (const t of c4Tokens(source)) {
    const name = JISON_NAMES[t.kind];
    const before = end;
    end = t.range.end;
    if (!name) continue;
    ranges.push([before, t.range.start]);
    if (name === LEXICAL_ERROR) {
      tokens.push([LEXICAL_ERROR, '']);
      break;
    }
    tokens.push([name, t.text]);
  }
  return { tokens, ranges };
}

/** D452's, #683's and #681's lexing changes, by the gate exclusion they are listed under. */
export type Exclusion = 'unquoted' | 'comment' | 'title' | 'hash' | 'quote';

/** The terminals whose text #683 lets run over a `#`. */
const HASH_RUNS = new Set(['title', 'accDescription']);

/**
 * Whether v13's `b` is a `title` or `accDescription` that runs over a `#` where v12's `a`
 * stopped at it, or where v12 matched none (a lexical error at the keyword).
 */
function runsOverHash(a: JisonToken | undefined, b: JisonToken | undefined): boolean {
  if (!b || !HASH_RUNS.has(b[0])) return false;
  if (a?.[0] === b[0]) return b[1].startsWith(a[1]) && b[1][a[1].length] === '#';
  return a?.[0] === LEXICAL_ERROR && /^\S+\s#/.test(b[1]);
}

/**
 * The D452 exclusion that explains the first difference, at token `at`, between v12's stream
 * and v13's, or undefined. `gap` is the source between the token before v13's and v13's.
 */
export function exclusion(
  v12: readonly JisonToken[],
  v13: readonly JisonToken[],
  at: number,
  gap: string
): Exclusion | undefined {
  const [a, b] = [v12[at], v13[at]];
  if (stopsUnquoted(a, b, v12[at - 1])) return 'unquoted';
  if (runsOverHash(a, b)) return 'hash';
  if (quoteChange(a, b)) return 'quote';
  if (b?.[0] === 'NEWLINE' && a?.[0] !== 'NEWLINE' && gap.includes('%%')) return 'comment';
  // v12's `title\s` took the line break (and the next line, or failed at a blank line).
  const loneTitle = b?.[0] === 'title' && b[1] === 'title';
  const tookLine = a?.[0] === 'title' && a[1].startsWith('title\n');
  return loneTitle && (a?.[0] === LEXICAL_ERROR || tookLine) ? 'title' : undefined;
}

/**
 * #681: whether v13's `b` is the text of a quoted value (also a named argument's) where v12's `a`
 * is an unquoted argument that starts with a tab and a quote, or is a quoted value that ran on past the line break
 * before a line starting like a statement (`Name(`), where v13's `b` stopped.
 */
function quoteChange(a: JisonToken | undefined, b: JisonToken | undefined): boolean {
  if (!a || !b || a[0] !== b[0] || (a[0] !== 'STR' && a[0] !== 'STR_VALUE')) return false;
  if (a[0] === 'STR' && /^ *\t[ \t]*"/.test(a[1])) return true;
  const start = /\n[ \t]*\w+\(/.exec(a[1]);
  return start !== null && b[1] === a[1].slice(0, start.index);
}

/** Whether v12's `a` ran over a `)` or line break where v13's `b` stopped (`before`: v12's). */
function stopsUnquoted(
  a: JisonToken | undefined,
  b: JisonToken | undefined,
  before: JisonToken | undefined
): boolean {
  // v12's last argument ran over the line break it appended, v13's stopped before it.
  if (a === undefined) return b?.[0] === 'NEWLINE' && before?.[0] === 'STR';
  if (a[0] !== 'STR') return false;
  // The oracle took v12's appended line break off its last token, so an image with no `)` or
  // line break ran to the end of the text.
  const stop = a[1].search(/[)\n]/);
  const prefix = stop === -1 ? a[1] : a[1].slice(0, stop);
  // v13's argument stopped at the `)` or line break, or the arguments ended there.
  return b?.[0] === 'STR' ? stop !== -1 && b[1] === prefix : /^ *$/.test(prefix);
}

/**
 * The D452 or #683 exclusion that makes v12's and v13's token streams for `source` differ, or
 * undefined when they agree (or v12 never lexed it as C4). Throws when they differ otherwise:
 * the lexer-parity gate fails on that source.
 */
export async function lexingExclusion(
  oracle: JisonLexerOracle,
  source: string
): Promise<Exclusion | undefined> {
  const v12 = await oracle.tokens(source);
  if (!v12) return undefined;
  const expected = v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]);
  const { tokens: actual, ranges } = v13Tokens(source);
  if (JSON.stringify(expected) === JSON.stringify(actual)) return undefined;
  let at = 0;
  while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
  const [from, to] = ranges[at] ?? [0, 0];
  const why = exclusion(expected, actual, at, source.slice(from, to));
  if (!why) throw new Error(`c4 lexer parity: difference no exclusion explains at token ${at}`);
  return why;
}
