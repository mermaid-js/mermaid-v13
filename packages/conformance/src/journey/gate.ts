/**
 * The journey lexer gate's two sides, for `lexer-parity.spec.ts` and `lexer-quirks.spec.ts`:
 * the v13 stream under jison terminal names, and the oracle's stream normalised to compare
 * with it. The exclusions are listed in `lexer-parity.spec.ts`.
 */
import { JISON_NAMES, journeyTokens } from '@mermaid-js/diagram-journey';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR } from '../jison/oracle.ts';
import type { JisonLexerOracle, JisonToken } from '../jison/oracle.ts';

const ACC_VALUES = new Set(['acc_title_value', 'acc_descr_value', 'acc_descr_multiline_value']);

/** v13's significant tokens of `source` as jison terminals, the kinds without one left out. */
export function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of journeyTokens(source)) {
    const name = JISON_NAMES[t.kind];
    if (!name) continue;
    if (name === LEXICAL_ERROR) {
      out.push([LEXICAL_ERROR, '']);
      break;
    }
    out.push([name, t.text]);
  }
  return out;
}

/** v12's tokens of `source` with entity placeholders decoded, or undefined when not lexed. */
export async function v12Tokens(
  oracle: JisonLexerOracle,
  source: string
): Promise<JisonToken[] | undefined> {
  return (await oracle.tokens(source))?.map(([n, i]): JisonToken => [n, decodeEntities(i)]);
}

/**
 * `v13` without its final `EOF` when `v12` has none and ends in an accessibility value (the
 * acc-state exclusion); otherwise `v13` itself.
 */
export function excludeAccEof(v12: readonly JisonToken[], v13: JisonToken[]): JisonToken[] {
  const last = v12.at(-1);
  if (!last || last[0] === 'EOF' || !ACC_VALUES.has(last[0])) return v13;
  return v13.at(-1)?.[0] === 'EOF' ? v13.slice(0, -1) : v13;
}
