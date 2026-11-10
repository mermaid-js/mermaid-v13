// cspell:words SPACELINE SPACELIST
import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { ishikawaTokens, ishikawaView, JISON_NAMES } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

/** Every token of `src`, trivia and `Kind.EOF` included, as source ranges. */
const stream = (src: string) => {
  const { from, view } = ishikawaView(src);
  const s = lex(src, from, view).tokens;
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => ishikawaTokens(src).filter((t) => t.kind === kind);
/** Text and source slice of each token of `kind`. */
const slices = (src: string, kind: number) =>
  of(src, kind).map((t) => [t.text, src.slice(t.range.start, t.range.end)]);
/** jison terminal and text of each token with one, as the parity gate sees them. */
const jison = (src: string) =>
  ishikawaTokens(src).flatMap((t) => {
    const name = JISON_NAMES[t.kind];
    return name ? [`${name}:${t.text}`] : [];
  });

// The expected streams below are v12's (the jison lexer oracle), for the quirks spec #519 lists.
describe('ishikawa.jison quirks', () => {
  it('lexes the probe: header, line break, indent, text, then the appended line break and EOF', () => {
    expect(jison('ishikawa-beta\n  P')).toEqual([
      'ISHIKAWA:ishikawa-beta',
      'NL:\n',
      'SPACELIST:  ',
      'TEXT:P',
      'NL:',
      'EOF:',
    ]);
  });

  it('ends a bare header in NL EOF, and a header with a line break in a SPACELINE', () => {
    // v12 rejects the first (no statement) and accepts the second with no effect.
    expect(jison('ishikawa-beta')).toEqual(['ISHIKAWA:ishikawa-beta', 'NL:', 'EOF:']);
    expect(jison('ishikawa-beta\n')).toEqual(['ISHIKAWA:ishikawa-beta', 'SPACELINE:\n', 'EOF:']);
    expect(jison('ishikawa-beta\n\n   \n\t\n')).toEqual([
      'ISHIKAWA:ishikawa-beta',
      'SPACELINE:\n\n   \n\t\n',
      'EOF:',
    ]);
  });

  it('trims the blank lines before the header, as v12 did', () => {
    expect(jison('\n\n  ishikawa-beta\n  P').slice(0, 2)).toEqual([
      'ISHIKAWA:ishikawa-beta',
      'NL:\n',
    ]);
  });

  it('reads both keywords case-insensitively, each ending in a word boundary', () => {
    expect(jison('ISHIKAWA\n P')[0]).toBe('ISHIKAWA:ISHIKAWA');
    expect(jison('IshiKawa-Beta\n P')[0]).toBe('ISHIKAWA:IshiKawa-Beta');
    // `ishikawa-beta\b` fails, so the bare keyword wins and the rest of the line is the effect.
    expect(jison('ishikawa-betax\n  P').slice(0, 2)).toEqual(['ISHIKAWA:ishikawa', 'TEXT:-betax']);
    expect(jison('ishikawa-beta_x\n  P').slice(0, 2)).toEqual([
      'ISHIKAWA:ishikawa',
      'TEXT:-beta_x',
    ]);
    // ASCII case folding only: the Kelvin sign is no `k`.
    expect(jison('ishikawa\n  i\u212Ashikawa')).toContain('TEXT:i\u212Ashikawa');
  });

  it('makes text on the header line, after blanks, a SPACELIST and a TEXT', () => {
    expect(jison('ishikawa-beta Problem here\n  A').slice(0, 4)).toEqual([
      'ISHIKAWA:ishikawa-beta',
      'SPACELIST: ',
      'TEXT:Problem here',
      'NL:\n',
    ]);
    expect(jison('ishikawa-beta\tTabbed\n  A')[1]).toBe('SPACELIST:\t');
  });

  it('lexes the keyword wherever a token starts, so a line starting with it is ISHIKAWA', () => {
    // v12 then rejects the document.
    expect(jison('ishikawa-beta\n  P\n  Ishikawa review').slice(5, 9)).toEqual([
      'SPACELIST:  ',
      'ISHIKAWA:Ishikawa',
      'SPACELIST: ',
      'TEXT:review',
    ]);
    expect(jison('ishikawa-beta\n  P\n  ishikawa-diagram').slice(6, 8)).toEqual([
      'ISHIKAWA:ishikawa',
      'TEXT:-diagram',
    ]);
    // Not inside a text, and not without a word boundary.
    const src = 'ishikawa-beta\n  P\n  The ishikawa way\n  ishikawas';
    expect(of(src, T.Ishikawa)).toHaveLength(1);
    expect(jison(src)).toEqual(expect.arrayContaining(['TEXT:The ishikawa way', 'TEXT:ishikawas']));
  });

  it('keeps an inline `%%` in the text; a whole-line comment is trivia', () => {
    expect(jison('ishikawa-beta\n  P\n  A %% not a comment\n  B%%glued')).toEqual(
      expect.arrayContaining(['TEXT:A %% not a comment', 'TEXT:B%%glued'])
    );
    const src = 'ishikawa-beta\n  P\n  %% a comment\n  A';
    expect(jison(src)).toEqual(jison('ishikawa-beta\n  P\n  A'));
    const comments = stream(src).filter((t) => t.kind === Kind.Comment);
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(['  %% a comment\n']);
  });

  it('makes a `%%` v12 left (on the header line, a bare `%%` line) a SPACELINE with the blanks before it', () => {
    expect(jison('ishikawa-beta %% c\n  P').slice(0, 3)).toEqual([
      'ISHIKAWA:ishikawa-beta',
      'SPACELINE: %% c',
      'NL:\n',
    ]);
    expect(jison('ishikawa-beta\n  P\n%%\n  A').slice(3, 6)).toEqual([
      'TEXT:P',
      'SPACELINE:\n%%',
      'NL:\n',
    ]);
    expect(of('ishikawa-beta\n  P\n%%\n  A', T.CommentLine)).toHaveLength(1);
  });

  it('ends a `%%` SPACELINE at U+2028, where a regex `.` stops', () => {
    // v12 then rejects the line: `P` follows a SPACELIST on the header line.
    expect(jison('ishikawa-beta %% c\u2028P\n  A').slice(1, 4)).toEqual([
      'SPACELINE: %% c',
      'SPACELIST:\u2028',
      'TEXT:P',
    ]);
  });

  it('makes `title`, `accTitle:` and `accDescr:` lines plain text: the grammar has no such syntax', () => {
    expect(jison('ishikawa-beta\n  P\n  title Foo\n  accTitle: x\n  accDescr: y')).toEqual(
      expect.arrayContaining(['TEXT:title Foo', 'TEXT:accTitle: x', 'TEXT:accDescr: y'])
    );
  });

  it('counts a tab as one blank of a SPACELIST', () => {
    expect(jison('ishikawa-beta\n\tP\n\t\tA')).toEqual([
      'ISHIKAWA:ishikawa-beta',
      'NL:\n',
      'SPACELIST:\t',
      'TEXT:P',
      'NL:\n',
      'SPACELIST:\t\t',
      'TEXT:A',
      'NL:',
      'EOF:',
    ]);
  });

  it('lexes each indent as it is: the baseline clamp is the parser’s', () => {
    expect(
      of('ishikawa-beta\n  P\n    A\n      a1\n  B\n    b1', T.SpaceList).map((t) => t.text)
    ).toEqual(['  ', '    ', '      ', '  ', '    ']);
  });

  it('backtracks `[\\s]+[\\n]` to the last line break of a blank run', () => {
    expect(jison('ishikawa-beta\n  P\n\n\n  A').slice(3, 6)).toEqual([
      'TEXT:P',
      'SPACELINE:\n\n\n',
      'SPACELIST:  ',
    ]);
    expect(jison('ishikawa-beta\n  P\n \t \n  A')[4]).toBe('SPACELINE:\n \t \n');
    // Blanks after the last line break of the text took the appended one.
    expect(jison('ishikawa-beta\n  P\n  A\n   ').slice(-2)).toEqual(['SPACELINE:\n   ', 'EOF:']);
  });

  it('keeps trailing blanks, `<br>` and line separators in the text', () => {
    expect(jison('ishikawa-beta\n  P   \n  A<br>B\n  C\u2028x\u2029y')).toEqual(
      expect.arrayContaining(['TEXT:P   ', 'TEXT:A<br>B', 'TEXT:C\u2028x\u2029y'])
    );
  });

  it('makes U+2028, NBSP and other `\\s` blanks indent, and a U+2028 run before a line break a SPACELINE', () => {
    expect(jison('ishikawa-beta\n  P\n\u2028A')).toEqual(
      expect.arrayContaining(['SPACELIST:\u2028', 'TEXT:A'])
    );
    expect(of('ishikawa-beta\n\u00a0\u00a0P\n\u3000A', T.SpaceList).map((t) => t.text)).toEqual([
      '\u00a0\u00a0',
      '\u3000',
    ]);
    expect(jison('ishikawa-beta\n  P\u2028\n  A')).toEqual(
      expect.arrayContaining(['TEXT:P\u2028', 'NL:\n'])
    );
    expect(jison('ishikawa-beta\n  P\n \u2028 \n  A')).toContain('SPACELINE:\n \u2028 \n');
  });

  it('reads entity codes, which v12 encoded before lexing, as entities in the token written', () => {
    expect(slices('ishikawa-beta\n  P #35; x #quot;', T.Text)).toEqual([
      ['P &#35; x &quot;', 'P #35; x #quot;'],
    ]);
  });

  it('gives the `;` v12 dropped from a `style…:…#…;` line to the text before it', () => {
    expect(slices('ishikawa-beta\n  P\n  style a:#f00;', T.Text)).toEqual([
      ['P', 'P'],
      ['style a:#f00', 'style a:#f00;'],
    ]);
  });

  it('never fails: every character is `[\\n]` or `[^\\n]`', () => {
    const src = 'ishikawa-beta\n  @{}[]()"`\'\\^#;:<>\u0000\n\u0085 \ud83d\ude00';
    expect(ishikawaTokens(src).some((t) => t.kind === Kind.Error)).toBe(false);
    expect(jison(src).at(-1)).toBe('EOF:');
  });
});

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a
// token that runs over one stays one token (pitfall 4: the parity gate would not see a split).
describe('tokens across removed spans', () => {
  it('keeps a text split by a directive one token', () => {
    const src = 'ishikawa-beta\n  P\n  A%%{init: {}}%%B\n  C';
    expect(slices(src, T.Text)).toEqual([
      ['P', 'P'],
      ['AB', 'A%%{init: {}}%%B'],
      ['C', 'C'],
    ]);
    expect(stream(src).filter((t) => t.kind === Kind.Directive)).toHaveLength(1);
  });

  it('keeps a blank run around a comment line one token, ranges in order', () => {
    const src = 'ishikawa-beta\n  P\n\n%% c\n   \n  A';
    const tokens = stream(src);
    const lines = tokens.filter((t) => t.kind === T.SpaceLine);
    expect(lines.map((t) => src.slice(t.start, t.end))).toEqual(['\n\n%% c\n   \n']);
    const comments = tokens.filter((t) => t.kind === Kind.Comment);
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(['\n%% c\n']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('gives a CRLF one line break and lexes it as LF; a lone CR too', () => {
    const src = 'ishikawa-beta\r\n  P\r\n\r\n  A\r\n';
    expect(jison(src)).toEqual(jison('ishikawa-beta\n  P\n\n  A\n'));
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline || t.kind === T.SpaceLine);
    // The last CRLF and the line break v12 appended are one run.
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\r\n', '\r\n\r\n', '\r\n']);
    expect(jison('ishikawa-beta\r  P\r  A')).toEqual(jison('ishikawa-beta\n  P\n  A'));
  });

  it('ends in a zero-width EOF at the end of the source, then `Kind.EOF`', () => {
    const src = 'ishikawa-beta\n  P\n  %% last';
    const tokens = stream(src);
    expect(tokens.at(-1)?.kind).toBe(Kind.EOF);
    const eof = tokens.filter((t) => t.kind === T.Eof);
    expect(eof).toEqual([{ kind: T.Eof, start: src.length, end: src.length }]);
  });
});
