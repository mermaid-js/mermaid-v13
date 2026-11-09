/**
 * The requirement corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source. Diagrams
 * go in as `.mmd` fixtures under `e2e/diagrams/requirement/`; text that only matters to the
 * lexer or the parser (rejections, comment forms, blanks, line separators, CRs) goes in
 * `corpus/requirement-cases.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { JisonRule } from '../jison/oracle.ts';
import { body, crlf, tabs } from '../kanban/corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/** The header line: v12's detector `/^\s*requirement(Diagram)?/` (case-sensitive). */
const HEADER = /^\s*requirement/;

/**
 * A directive through the middle of every line after the header line (pitfall 3): at the
 * middle of the line's text after its indent, moved off a surrogate pair. Lines with fewer
 * than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => HEADER.test(l));
    return lines
      .map((line, k) => {
        const text = line.trimStart();
        if (k <= header || text.length < 2 || text.startsWith('%%')) return line;
        let at = line.length - text.length + Math.floor(text.length / 2);
        if (/[\udc00-\udfff]/.test(line.charAt(at))) at++;
        return line.slice(0, at) + DIRECTIVE + line.slice(at);
      })
      .join('\n');
  });

/** A blank before every line break of the body, and at its end (D431's case everywhere). */
export const trailingBlanks = (src: string): string =>
  body(src, (b) => b.replace(/\r?\n/g, ' $&') + ' ');

/** The cases (`corpus/requirement-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function requirementCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/requirement-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The requirement corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function requirementCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/requirement'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/requirement-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['trailing blanks', trailingBlanks],
  ['mid-line directive', midLineDirective],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function requirementGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await requirementCorpus()), ...requirementCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
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

/** The line starts (after blanks a regex `.` matches) with a `direction` statement. */
const DIRECTION_STATEMENT = /^(?=[^\S\n\r\u2028\u2029]*direction\s+(?:TB|BT|RL|LR))/i;

/**
 * D432 (spec #520 Q2): v12's four direction rules, unchanged, but tried only at a line start
 * whose first word is `direction` followed by a direction; elsewhere they never match, so the
 * rest of the line lexes as usual.
 */
export const D432_RULES: Readonly<Record<number, JisonRule>> = Object.fromEntries(
  DIRECTION_RULES.map((rule, d) => {
    const v12 = new RegExp(
      String.raw`^(?:.*direction\s+${['TB', 'BT', 'RL', 'LR'][d]}[^\n]*)`,
      'i'
    );
    const amended: JisonRule = (input, matched) =>
      atLineStart(matched) && DIRECTION_STATEMENT.test(input) ? input.match(v12) : null;
    return [rule, amended];
  })
);

/** Both decisions: the lexer v13's is gated on. */
export const DECIDED_RULES: Readonly<Record<number, JisonRule>> = {
  ...D431_RULES,
  ...D432_RULES,
};
