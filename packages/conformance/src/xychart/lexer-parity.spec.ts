// cspell:words xychart barchart
import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, lexXyChart } from '@mermaid-js/diagram-xychart';
import { tokenValue } from '@mermaid-js/diagram-xychart/testing';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { XYCHART_VARIANTS, xyChartGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (#507, parser-method §1, D212): the v13 XY chart lexer emits the same
 * terminals, with the same images, as mermaid 12.2.0's `xychart.jison` lexer on the text v12
 * lexed (`loadJisonLexerOracle('xychart')`).
 *
 * Corpus (`corpus.ts`, {@link xyChartGateCorpus}): the 62 e2e fixtures (the 11 baselines included), the 70 harvested v12
 * spec and syntax-page strings and the 141 cases of `corpus/xychart-cases.json` (the spec's
 * quirks: uppercase keywords, `xychartx`, `barchart`, unquoted text, the unreachable `MD_STR`,
 * glued comments, number forms, both orientations, `;`, plot before axis, missing band values,
 * duplicate categories, reversed ranges, `accTitle`/`accDescr`; unclosed and odd directives,
 * U+2028/U+2029, CR and error cases), each again in every generated variant that changes it
 * (`XYCHART_VARIANTS`: comment lines added or one through the middle of a short body, every line break
 * a CR followed by a removed comment or directive line, CRLF, U+2028 or U+2029 before every
 * line break, a directive through the middle of every line).
 *
 * Images are compared as v12's parser read them: the oracle's images with entity placeholders
 * decoded and the `\n` v12 appended taken off the token that matched it, against the package's
 * `tokenValue` (which does both, so the gate exercises it). The text v13 rebuilt is also checked against the exact text the oracle saw, and every source is compared
 * but the ones listed in {@link NOT_DETECTED}. A separate check holds every token's source range
 * to the contract ({@link rangeViolations}).
 *
 * Exclusions (v13 tokens with no jison terminal, left out of the comparison):
 * - comments and directives v12 removed before lexing, and the `%%` comments jison's rules skip
 *   (`%%…`, and `x%%…` with the character before it, a `]` or line break too), are v13 trivia;
 * - the text jison matches without returning a token: blank runs, the `"` around a string,
 *   `accDescr {` and its `}`, and the text of the dead `md_string` rule;
 * - the sources listed in {@link NOT_DETECTED}, which v12 does not detect as an XY chart, so it
 *   never ran the lexer on them.
 * After a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`; v13
 * writes an error token and carries on (for recovery). Empty-image tokens (`EOF`, `STR ""` and
 * an empty `acc_descr_multiline_value` at the end of an unclosed string or block, an empty
 * `acc_title_value`) are emitted by v13 too and compared as they are.
 */
function cut(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(([n]) => n === LEXICAL_ERROR);
  return i < 0 ? tokens : [...tokens.slice(0, i), [LEXICAL_ERROR, '']];
}

/** v13's stream as jison names and the package's own token values (`tokenValue`). */
function v13Tokens(source: string): JisonToken[] {
  const l = lexXyChart(source);
  const out: JisonToken[] = [];
  for (let i = 0; i < l.tokens.length - 1; i++) {
    const name = JISON_NAMES[l.tokens.kind[i] ?? -1];
    if (!name || (l.textStart[i] ?? -1) < 0) continue;
    out.push([name, tokenValue(l, i)]);
  }
  return cut(out);
}

const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

const VARIANT = new RegExp(` \\((?:${XYCHART_VARIANTS.map(([s]) => s).join('|')})\\)$`);

describe('xychart lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('xychart');
    const items = await xyChartGateCorpus();
    const diffs: string[] = [];
    const undetected: string[] = [];
    let compared = 0;
    let e2e = 0;
    let specs = 0;
    let cases = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) {
        undetected.push(item.id);
        continue;
      }
      compared++;
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e/')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('xychart-cases/')) cases++;
      }
      const input = await oracle.lexedText(item.source);
      if (input !== lexXyChart(item.source).v12.text) {
        diffs.push(`${item.id} (lexed text)\n  v12 ${JSON.stringify(input)}`);
        continue;
      }
      const expected = cut(v12.map(([n, i]): JisonToken => [n, v12TokenText(i)]));
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      const around = (t: JisonToken[]) => show(t.slice(Math.max(0, at - 2), at + 3));
      diffs.push(`${item.id} @${at}\n  v12 ${around(expected)}\n  v13 ${around(actual)}`);
    }
    process.stdout.write(`xychart lexer parity: ${compared} of ${items.length} sources lexed\n`);
    // Every e2e fixture, harvested string and case reaches the lexer, but the listed cases.
    expect(e2e).toBe(65);
    expect(specs).toBe(70);
    expect(cases).toBe(141);
    expect(undetected.sort()).toEqual([...NOT_DETECTED.keys()].sort());
    expect(compared).toBe(items.length - NOT_DETECTED.size);
    expect(diffs).toEqual([]);
  }, 300_000);

  it('maps every token to a consistent source range', async () => {
    const bad: string[] = [];
    for (const item of await xyChartGateCorpus()) {
      for (const v of rangeViolations(item.source)) bad.push(`${item.id}: ${v}`);
    }
    expect(bad).toEqual([]);
  }, 60_000);

  it('fires every jison rule over the corpus', async () => {
    const fired = new Set<number>();
    for (const item of await xyChartGateCorpus())
      lexXyChart(item.source, (rule) => fired.add(rule));
    // Rule 26 (the dead `md_string` rule) fires on its own text (`md-string-dead-rule-*`); rule
    // 5 (`%%[^\n]*`) on a `%%{` v12 keeps (`comment-empty-directive`).
    const never = Array.from({ length: 47 }, (_, k) => k).filter((k) => !fired.has(k));
    expect(never).toEqual([]);
  }, 60_000);
});

/**
 * The cases v12 does not detect as an XY chart (its detector `/^\s*xychart(-beta)?/` is
 * case-sensitive and anchored, though its lexer is not), so its lexer never ran and there is
 * nothing to compare. Any other source v12 does not detect fails the gate.
 */
const DETECTION_EXCLUSIONS: readonly (readonly [string, string, readonly string[]])[] = [
  [
    'xychart-cases/header-uppercase-not-detected',
    'header `XYCHART`',
    ['commented', 'CR cut', 'CR cut by a directive', 'CRLF', 'mid-line directive'],
  ],
  [
    'xychart-cases/header-barchart-not-detected',
    'header `barchart`',
    ['commented', 'CR cut', 'CR cut by a directive', 'CRLF'],
  ],
  [
    'xychart-cases/header-not-first',
    'a statement before the header',
    [
      'commented',
      'CR cut',
      'CR cut by a directive',
      'CRLF',
      'line separators',
      'paragraph separators',
      'mid-line directive',
    ],
  ],
];

const NOT_DETECTED: ReadonlyMap<string, string> = new Map(
  DETECTION_EXCLUSIONS.flatMap(([id, why, variants]) => [
    [id, why],
    ...variants.map((v): [string, string] => [`${id} (${v})`, why]),
  ])
);

/**
 * Where the source ranges of `src`'s tokens break the stream's contract (empty when none):
 * - each character of the text v12 lexed has the range of the source it stands for: one source
 *   character (`'` for a converted tag quote, `ﬂ` for an entity's `#`, `¶` for its `;`), a
 *   CRLF read as LF, or zero-width at the end of the one before (the rest of an entity
 *   placeholder, and the `\n` v12 appended), in source order;
 * - each token of that text (named or not) spans exactly the source of its characters;
 * - tokens are in source order and those of v12's text do not overlap; a removed span (trivia)
 *   lies between them, or inside the token right before it (a string over a comment line);
 * - every source character after the leading blanks v12 trimmed is in a token, but a `;` v12
 *   dropped (`encodeEntities` drops the last `;` of a `style …:…#…;` line).
 */
const READ_AS: ReadonlyMap<string, string> = new Map([
  ['#', 'ﬂ'],
  [';', '¶'],
  ['"', "'"],
  ['\r', '\n'],
]);

function rangeViolations(src: string): string[] {
  const l = lexXyChart(src);
  const v = l.v12;
  const t = l.tokens;
  const out: string[] = [];
  // The appended `\n` is zero-width at the end of the source.
  const at = (i: number) =>
    i >= v.length ? src.length : v.starts ? (v.starts[i] ?? 0) : v.from + i;
  const to = (i: number) =>
    i >= v.length ? src.length : v.ends ? (v.ends[i] ?? 0) : v.from + i + 1;
  for (let i = 0; i < v.text.length; i++) {
    const a = at(i);
    const b = to(i);
    const c = v.text[i] ?? '';
    const prevEnd = i > 0 ? to(i - 1) : 0;
    let ok = a <= b && b <= src.length && (i === 0 || a >= prevEnd);
    if (b === a + 1) {
      const s = src[a] ?? '';
      ok &&= s === c || READ_AS.get(s) === c;
    } else if (b === a + 2) ok &&= src.slice(a, b) === '\r\n' && c === '\n';
    else if (b === a) ok &&= i >= v.length ? c === '\n' : '°ß'.includes(c) && a === prevEnd;
    else ok = false;
    if (!ok) out.push(`char ${i} ${JSON.stringify(c)} at ${a}-${b}`);
  }
  const covered = new Uint8Array(src.length);
  let lastStart = 0;
  let prev = -1;
  for (let j = 0; j < t.length - 1; j++) {
    const start = t.start[j] ?? 0;
    const end = t.end[j] ?? 0;
    const ts = l.textStart[j] ?? -1;
    const te = l.textEnd[j] ?? -1;
    const name = JISON_NAMES[t.kind[j] ?? -1] ?? String(t.kind[j]);
    const where = `${name}@${start}-${end}`;
    if (start > end || end > src.length || start < lastStart) out.push(`${where} out of order`);
    lastStart = start;
    if (ts < 0) {
      const kind = t.kind[j];
      if (kind !== Kind.Comment && kind !== Kind.Directive) out.push(`${where} has no text`);
      const before = prev < 0 ? 0 : (t.end[prev] ?? 0);
      const inside = prev >= 0 && (t.start[prev] ?? 0) <= start && end <= before;
      if (start < before && !inside) out.push(`${where} overlaps the token before`);
      covered.fill(1, start, end);
      continue;
    }
    const last = Math.min(te, v.length) - 1;
    const wantStart = ts < v.length ? at(ts) : src.length;
    const wantEnd = last >= ts ? Math.max(wantStart, to(last)) : wantStart;
    if (start !== wantStart || end !== wantEnd)
      out.push(`${where}, its text is at ${wantStart}-${wantEnd}`);
    if (prev >= 0 && start < (t.end[prev] ?? 0)) out.push(`${where} overlaps the token before`);
    covered.fill(1, start, end);
    prev = j;
  }
  const first = l.textStart.findIndex((s) => s >= 0);
  const from = first < 0 ? src.length : (t.start[first] ?? 0);
  for (let i = from; i < src.length; i++) {
    if (!covered[i] && src[i] !== ';')
      out.push(`source ${i} ${JSON.stringify(src[i])} in no token`);
  }
  return out;
}
