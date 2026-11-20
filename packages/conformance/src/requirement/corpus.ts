/**
 * The requirement corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source. Diagrams
 * go in as `.mmd` fixtures under `e2e/diagrams/requirement/`; text that only matters to the
 * lexer or the parser (rejections, comment forms, blanks, line separators, CRs) goes in
 * `corpus/requirement-cases.json`.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import { body, crlf, DIRECTIVE, midLineDirective, tabs, withVariants } from '../gate-variants.ts';
import type { Variant } from '../gate-variants.ts';
import { loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonRule } from '../jison/oracle.ts';
import { loadOracle } from '../oracle.ts';
import type { Oracle } from '../oracle.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** The header line: v12's detector `/^\s*requirement(Diagram)?/` (case-sensitive). */
const HEADER = /^\s*requirement/;

/** A blank before every line break of the body, and at its end (D431's case everywhere). */
export const trailingBlanks = (src: string): string =>
  body(src, (b) => b.replace(/\r?\n/g, ' $&') + ' ');

/** The cases (`corpus/requirement-cases.json`): each corpus gap, quirk and rejection v12 has. */
export const requirementCases = (): CorpusItem[] => corpusJson('requirement-cases.json');

/** The requirement corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const requirementCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('requirement');

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly Variant[] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['trailing blanks', trailingBlanks],
  ['mid-line directive', midLineDirective(HEADER)],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function requirementGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await requirementCorpus()), ...requirementCases()], VARIANTS);
}

// --- The two decided lexer changes, applied to v12's own lexer -------------------------------

/**
 * Whether the text jison has matched so far ends at a line start: in a line break and then
 * blanks only (or is empty). The next token then starts its line.
 */
function atLineStart(matched: string): boolean {
  for (let i = matched.length - 1; i >= 0; i--) {
    const ch = matched.charAt(i);
    if (ch === '\n') return true;
    if (!/\s/.test(ch)) return false;
  }
  return true;
}

/** Rule 13 of the compiled lexer: `\s+`, skipped. */
const BLANKS_RULE = 13;
/** Rules 8–11: `.*direction\s+(TB|BT|RL|LR)[^\n]*`. */
const DIRECTION_RULES = [8, 9, 10, 11] as const;

/**
 * D431 (spec #520 Q1): a blank run after other text on its line stops at its first line
 * break, so the line break is a `NEWLINE` (v12's `\s+` swallowed it). At a line start the
 * whole run is skipped as before.
 */
export const D431_RULES: Readonly<Record<number, JisonRule>> = {
  [BLANKS_RULE]: (input, matched) =>
    input.match(atLineStart(matched) ? /^(?:\s+)/ : /^(?:[^\S\n]+)/),
};

/** The four directions, in the order of v12's rules 8–11. */
export const DIRECTIONS = ['TB', 'BT', 'RL', 'LR'] as const;

/**
 * D432 (spec #520 Q2): `direction` is read only as a statement at the start of a line, and the
 * statement is `direction`, blanks (no line break) and a direction, then `\b` (as jison ends
 * its keyword rules); the rest of the line lexes as usual. v12's rules took anything before
 * and after on the line, at any token start.
 */
export const D432_RULES: Readonly<Record<number, JisonRule>> = Object.fromEntries(
  DIRECTION_RULES.map((rule, d) => {
    const statement = new RegExp(
      String.raw`^(?:direction[^\S\n\r\u2028\u2029]+${DIRECTIONS[d]}\b)`,
      'i'
    );
    const amended: JisonRule = (input, matched) =>
      atLineStart(matched) ? input.match(statement) : null;
    return [rule, amended];
  })
);

/** Both decisions: the lexer v13's is gated on. */
export const DECIDED_RULES: Readonly<Record<number, JisonRule>> = {
  ...D431_RULES,
  ...D432_RULES,
};

/**
 * mermaid\@12 with {@link DECIDED_RULES} in its own lexer: v12's parser and DB on the token
 * stream v13's lexer is gated on, for model parity and the grammar differential over the
 * gate's variants (a blank before every line break is D431's case everywhere).
 */
export async function decidedOracle(): Promise<Oracle> {
  const oracle = await loadOracle();
  const lexer = await loadJisonLexerOracle('requirement');
  return {
    version: oracle.version,
    detect: (text) => oracle.detect(text),
    parse: (text, config) => lexer.withRules(DECIDED_RULES, () => oracle.parse(text, config)),
  };
}
