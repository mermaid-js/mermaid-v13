// cspell:words quadrantchart
import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, lexQuadrant } from '@mermaid-js/diagram-quadrant';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { NOT_DETECTED, QUIRKS, quadrantGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (#300, parser-method §1, D212): the v13 quadrant lexer emits the same
 * terminals, with the same images, as mermaid 12.2.0's `quadrant.jison` lexer on the text v12
 * lexed (`loadJisonLexerOracle('quadrant')`).
 *
 * Corpus: `corpus.ts` ({@link quadrantGateCorpus}): the e2e fixtures, the v12 spec strings, the
 * parser cases, the named quirk cases ({@link QUIRKS}), lexer, line-separator and CRLF cases,
 * each again with comment lines added (pitfall 3).
 *
 * Images are compared as v12's lexer matched them, entity placeholders decoded, including the
 * `\n` v12 appended (v13 lexes it too; `quadrantTokens` clips it off for consumers). The text
 * v13 rebuilt is also checked against the exact text the oracle saw, and every source is
 * compared but the ones listed in {@link NOT_DETECTED}. A separate check holds every token's
 * source range to the contract ({@link rangeViolations}).
 *
 * Exclusions (v13 tokens with no jison terminal, left out of the comparison):
 * - comments and directives v12 removed before lexing, and the `%%` comments jison's rules
 *   skip (`%%…`, and `x%%…` with the character before), are v13 trivia tokens;
 * - the openers and closers jison matches without returning a token: `"`, the quote-backtick pair
 *   opening a markdown string and the backtick-quote pair closing it,
 *   `:::`, `accDescr {` and its `}`, the `,` between coordinates and the closing `]`;
 * - the sources listed in {@link NOT_DETECTED}, which v12 does not detect as a quadrant chart,
 *   so it never ran the lexer on them.
 * After a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`; v13
 * writes an error token and carries on (for recovery). Empty-image tokens (`EOF`, `STR ""` at an
 * unclosed string, an empty `title_value`) are emitted by v13 too and compared as they are.
 */
function cut(tokens: JisonToken[]): JisonToken[] {
  const i = tokens.findIndex(([n]) => n === LEXICAL_ERROR);
  return i < 0 ? tokens : [...tokens.slice(0, i), [LEXICAL_ERROR, '']];
}

/** v13's stream as jison names and images (the span of v12's text each token matched). */
function v13Tokens(source: string): JisonToken[] {
  const l = lexQuadrant(source);
  const out: JisonToken[] = [];
  for (let i = 0; i < l.tokens.length - 1; i++) {
    const name = JISON_NAMES[l.tokens.kind[i] ?? -1];
    const s = l.textStart[i] ?? -1;
    if (!name || s < 0) continue;
    out.push([name, v12TokenText(l.v12.text.slice(s, l.textEnd[i] ?? s))]);
  }
  return cut(out);
}

const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

/** Whether `run` occurs in `tokens` as consecutive tokens. */
function contains(tokens: JisonToken[], run: JisonToken[]): boolean {
  const key = (t: JisonToken[]) => t.map((x) => JSON.stringify(x)).join(',');
  return key(tokens).includes(key(run));
}

describe('quadrant lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and the cases', async () => {
    const oracle = await loadJisonLexerOracle('quadrant');
    const items = await quadrantGateCorpus();
    const diffs: string[] = [];
    const undetected: string[] = [];
    let compared = 0;
    let e2e = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source, { keepAppendedNewline: true });
      if (!v12) {
        undetected.push(item.id);
        continue;
      }
      compared++;
      if (item.id.startsWith('e2e/') && !item.id.endsWith('(commented)')) e2e++;
      const input = await oracle.lexedText(item.source);
      if (input !== lexQuadrant(item.source).v12.text) {
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
    process.stdout.write(`quadrant lexer parity: ${compared} of ${items.length} sources lexed\n`);
    // Every e2e fixture reaches the quadrant lexer: v12's 14, the 18 baselines (#317 and later)
    // and #1039's override fixture.
    expect(e2e).toBe(14 + 18 + 1);
    // Every source is compared, but the listed ones v12 does not detect.
    expect(undetected.sort()).toEqual([...NOT_DETECTED.keys()].sort());
    expect(compared).toBe(items.length - NOT_DETECTED.size);
    expect(diffs).toEqual([]);
  }, 120_000);

  it.each(QUIRKS)('quirk: $id', async ({ source, has }) => {
    const oracle = await loadJisonLexerOracle('quadrant');
    const v12 = cut(
      ((await oracle.tokens(source, { keepAppendedNewline: true })) ?? []).map(
        ([n, i]): JisonToken => [n, v12TokenText(i)]
      )
    );
    expect(contains(v12, has), show(v12)).toBe(true);
    expect(v13Tokens(source)).toEqual(v12);
  });

  it('maps every token to a consistent source range', async () => {
    const bad: string[] = [];
    for (const item of await quadrantGateCorpus()) {
      for (const v of rangeViolations(item.source)) bad.push(`${item.id}: ${v}`);
    }
    expect(bad).toEqual([]);
  }, 60_000);

  it('fires every reachable jison rule over the corpus', async () => {
    const fired = new Set<number>();
    for (const item of await quadrantGateCorpus())
      lexQuadrant(item.source, (rule) => fired.add(rule));
    const never = Array.from({ length: 53 }, (_, k) => k).filter((k) => !fired.has(k));
    expect(never).toEqual(UNREACHABLE);
  }, 60_000);
});

/**
 * jison rules (numbered from 0 in `quadrant.jison` order) no input can fire: 41 (`\=`) is a
 * duplicate of 40 (`"="`). Rule 3 (`%%[^\n]*`) fires only after a lexical error (`}%%{`: `}` is
 * an error, then neither rule 0 nor rule 1 takes `%%{`), so v12 never reached it, but v13 lexes
 * on for recovery.
 */
const UNREACHABLE = [41];

/**
 * Where the source ranges of `src`'s tokens break the stream's contract (empty when none):
 * - each character of the text v12 lexed has the range of the source it stands for: one source
 *   character (`'` for a converted tag quote, `ﬂ` for an entity's `#`, `¶` for its `;`), a
 *   CRLF read as LF, or zero-width at the end of the one before (the rest of an entity
 *   placeholder, and the `\n` v12 appended), in source order;
 * - each token of that text (named or not) spans exactly the source of its characters, so the
 *   source at its range re-lexes to its image, character for character;
 * - tokens are in source order and those of v12's text do not overlap; a removed span (trivia)
 *   lies between them, or inside the token right before it (a string over a comment line);
 * - every source character after the leading blanks v12 trimmed is in a token, but the `;`
 *   v12 dropped from `classDef` lines.
 */
/** One source character read as another: an entity's `#` and `;`, a tag quote, a lone CR. */
const READ_AS: ReadonlyMap<string, string> = new Map([
  ['#', 'ﬂ'],
  [';', '¶'],
  ['"', "'"],
  ['\r', '\n'],
]);

function rangeViolations(src: string): string[] {
  const l = lexQuadrant(src);
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
