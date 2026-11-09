// cspell:words xychart xychartx
import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, lexXyChart, XyChartTokenKind as T, xyChartTokens } from './index.ts';

/** `name:text@start-end` per token, trivia included (the gate in conformance compares names). */
function dump(src: string): string[] {
  const l = lexXyChart(src);
  const out: string[] = [];
  for (let i = 0; i < l.tokens.length - 1; i++) {
    const kind = l.tokens.kind[i] ?? -1;
    const name =
      JISON_NAMES[kind] ??
      (kind === Kind.Comment ? 'comment' : kind === Kind.Directive ? 'directive' : String(kind));
    out.push(`${name}@${l.tokens.start[i]}-${l.tokens.end[i]}`);
  }
  return out;
}

/** `NAME:text` per significant token with a jison name (the oracle's view, less the clipped `\n`). */
const named = (src: string): string[] =>
  xyChartTokens(src).flatMap((t) => {
    const name = JISON_NAMES[t.kind];
    return name ? [`${name}:${t.text}`] : [];
  });

const H = 'xychart\n';

describe('xychart lexer', () => {
  it('maps every token back to its source range', () => {
    expect(dump('xychart\n  bar [1, 2]')).toEqual([
      'XYCHART@0-7',
      'NEWLINE@7-8',
      `${T.Blanks}@8-10`,
      'BAR@10-13',
      `${T.Blanks}@13-14`,
      'SQUARE_BRACES_START@14-15',
      'NUMBER_WITH_DECIMAL@15-16',
      'COMMA@16-17',
      `${T.Blanks}@17-18`,
      'NUMBER_WITH_DECIMAL@18-19',
      'SQUARE_BRACES_END@19-20',
      // v12's appended line break: zero-width at the end of the source.
      'NEWLINE@20-20',
      'EOF@20-20',
    ]);
  });

  // The quirks below are oracle-checked in packages/conformance (`xychart-cases.json`).
  it('ends keywords in \\b, but not vertical|horizontal', () => {
    expect(named('xychartx verticalx\nbars [1]')).toEqual([
      'ALPHA:xychartx',
      'CHART_ORIENTATION:vertical',
      'ALPHA:x',
      'NEWLINE:\n',
      'ALPHA:bars',
      'SQUARE_BRACES_START:[',
      'NUM:1',
      'SQUARE_BRACES_END:]',
      'NEWLINE:',
      'EOF:',
    ]);
  });

  it('is case-insensitive', () => {
    expect(named('xychart HORIZONTAL\nX-AXIS [a]').slice(0, 4)).toEqual([
      'XYCHART:xychart',
      'CHART_ORIENTATION:HORIZONTAL',
      'NEWLINE:\n',
      'X_AXIS:X-AXIS',
    ]);
  });

  it('lexes a digit run as NUMBER_WITH_DECIMAL in axis_data and as NUM in data', () => {
    expect(named(H + 'x-axis Year2024 [a]').slice(2, 5)).toEqual([
      'X_AXIS:x-axis',
      'ALPHA:Year',
      'NUMBER_WITH_DECIMAL:2024',
    ]);
    expect(named(H + 'bar Q1 2024 [1]').slice(2, 6)).toEqual([
      'BAR:bar',
      'ALPHA:Q',
      'NUM:1',
      'NUM:2024',
    ]);
  });

  it('reads the number forms v12 reads', () => {
    expect(named(H + 'bar [.5, +2, 1e3, 1., +-1]').filter((t) => !t.startsWith('COMMA'))).toEqual([
      'XYCHART:xychart',
      'NEWLINE:\n',
      'BAR:bar',
      'SQUARE_BRACES_START:[',
      'NUMBER_WITH_DECIMAL:.5',
      'NUMBER_WITH_DECIMAL:+2',
      'NUMBER_WITH_DECIMAL:1',
      'ALPHA:e',
      'NUMBER_WITH_DECIMAL:3',
      'NUMBER_WITH_DECIMAL:1',
      'DOT:.',
      'PLUS:+',
      'NUMBER_WITH_DECIMAL:-1',
      'SQUARE_BRACES_END:]',
      'NEWLINE:',
      'EOF:',
    ]);
  });

  it('lets a glued comment take the character before it, a ] too', () => {
    expect(dump(H + 'bar [1]%% c').slice(5)).toEqual([
      'NUMBER_WITH_DECIMAL@13-14',
      // jison's rule `[^\}]%%[^\n]*`: no SQUARE_BRACES_END.
      'comment@14-19',
      'NEWLINE@19-19',
      'EOF@19-19',
    ]);
  });

  it('never opens a markdown string: a backtick is an error, the dead rule text is skipped', () => {
    expect(named(H + 'title `md`').slice(2, 4)).toEqual(['title:title', 'LEXICAL_ERROR:`']);
    const dead =
      '`)' +
      ' '.repeat(36) +
      '{ this.pushState(md_string); }\n<md_string>(?:(?!`").)+' +
      ' '.repeat(18) +
      '{ return MD_STR; }\n<md_string>(?:`';
    const t = xyChartTokens(H + 'title a' + dead + 'b');
    const kinds = t.map((x) => x.kind).filter((k) => k !== T.Blanks);
    expect(kinds.slice(3, 6)).toEqual([T.Alpha, T.DeadMdRule, T.Alpha]);
  });

  it('keeps ; and # in accTitle and accDescr values', () => {
    expect(named(H + 'accTitle: a ; b #c\naccDescr: d').slice(2)).toEqual([
      'acc_title:accTitle: ',
      'acc_title_value:a ; b #c',
      'NEWLINE:\n',
      'acc_descr:accDescr: ',
      'acc_descr_value:d',
      'NEWLINE:',
      'EOF:',
    ]);
  });

  it('lets a blank run take the line break after it', () => {
    expect(named(H + 'bar [1] \nline [2]').slice(5, 7)).toEqual([
      'SQUARE_BRACES_END:]',
      'LINE:line',
    ]);
  });

  it('runs an unterminated string to the end, then an empty STR', () => {
    expect(named(H + 'title "open\nbar [1]').slice(2)).toEqual([
      'title:title',
      'STR:open\nbar [1]',
      'STR:',
    ]);
  });

  it('keeps one STR token across a removed comment line (pitfall 4)', () => {
    const src = H + 'title "a\n%% c\nb"';
    const str = xyChartTokens(src).filter((t) => t.kind === T.Str);
    expect(str.map((t) => [t.text, t.range.start, t.range.end])).toEqual([['a\nb', 15, 23]]);
  });

  it('reads CRLF as one line break and keeps its source range', () => {
    const nl = xyChartTokens('xychart\r\nbar [1]\r\n').filter((t) => t.kind === Kind.Newline);
    expect(nl.map((t) => [t.text, t.range.start, t.range.end])).toEqual([
      ['\n', 7, 9],
      // In the `data` state `\r?\n` takes one line break and leaves the state, so v12's
      // appended line break is a NEWLINE of its own (zero-width at the end).
      ['\n', 16, 18],
      ['', 18, 18],
    ]);
  });

  it('writes comment lines and directives as trivia, in source order', () => {
    const src = '%%{init: {}}%%\nxychart\n%% c\nbar [1] %% tail\n';
    expect(dump(src).filter((t) => /^(comment|directive)/.test(t))).toEqual([
      'directive@0-14',
      'comment@23-28',
      // jison's own rule: the blank before `%%` goes with the comment.
      'comment@35-43',
    ]);
  });

  it('cuts an unclosed directive as v12 did: to the end, or after a word argument', () => {
    expect(dump(H + 'bar [1] %%{x}\nline [2]').slice(-3)).toEqual([
      `${T.Blanks}@15-16`,
      'directive@16-30',
      'EOF@30-30',
    ]);
    expect(named(H + 'bar [1] %%{x y\nline [2]').slice(5, 7)).toEqual([
      'SQUARE_BRACES_END:]',
      'LINE:line',
    ]);
  });

  it('writes an error token where jison throws, then lexes on from the initial state', () => {
    expect(named(H + 'title a(b\nbar [1]')).toEqual([
      'XYCHART:xychart',
      'NEWLINE:\n',
      'title:title',
      'ALPHA:a',
      'LEXICAL_ERROR:(',
      'ALPHA:b',
      'NEWLINE:\n',
      'BAR:bar',
      'SQUARE_BRACES_START:[',
      'NUMBER_WITH_DECIMAL:1',
      'SQUARE_BRACES_END:]',
      'NEWLINE:',
      'EOF:',
    ]);
  });

  it('writes one error per code point', () => {
    const errors = xyChartTokens(H + 'title 😀é').filter((t) => t.kind === Kind.Error);
    expect(errors.map((t) => [t.text, t.range.start, t.range.end])).toEqual([
      ['😀', 14, 16],
      ['é', 16, 17],
    ]);
  });
});
