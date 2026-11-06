import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ganttTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

const stream = (src: string) => {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const s = lex(src, pre.bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => ganttTokens(src).filter((t) => t.kind === kind);
const slices = (src: string, kind: number) =>
  of(src, kind).map((t) => [t.text, src.slice(t.range.start, t.range.end)]);
const comments = (src: string) =>
  stream(src)
    .filter((t) => t.kind === Kind.Comment)
    .map((t) => src.slice(t.start, t.end));

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a
// token that runs over one stays one token (pitfall 4: the parity gate would not see a split).
describe('tokens across removed spans', () => {
  it('keeps task text and task data split by a directive one token each', () => {
    const src = 'gantt\nWri%%{init: {}}%%te :a1, 20%%{init: {}}%%14-01-01, 3d\nb :1d';
    expect(slices(src, T.TaskText)).toEqual([
      ['Write ', 'Wri%%{init: {}}%%te '],
      ['b ', 'b '],
    ]);
    expect(slices(src, T.TaskData)).toEqual([
      [':a1, 2014-01-01, 3d', ':a1, 20%%{init: {}}%%14-01-01, 3d'],
      [':1d', ':1d'],
    ]);
  });

  it('keeps a bare title and the line it takes, across a comment line, one token', () => {
    const src = 'gantt\ntitle\n%% c\nfoo\na :1d';
    expect(slices(src, T.Title)).toEqual([['title\nfoo', 'title\n%% c\nfoo']]);
  });

  it('keeps a multi-line accessibility description split by a comment line one token', () => {
    const src = 'gantt\naccDescr {\na\n%% c\nb\n}\nx :1d';
    const values = of(src, T.AccDescrMultilineValue);
    expect(values.map((t) => t.text)).toEqual(['a\nb\n']);
    expect(src.slice(values[0]?.range.start, values[0]?.range.end)).toBe('a\n%% c\nb\n');
  });

  it('keeps a link and callback arguments split by a directive one token each', () => {
    const src = 'gantt\na :a1, 1d\nclick a1 href "ht%%{init: {}}%%tp" call f(x, %%{init: {}}%%y)';
    expect(of(src, T.Href).map((t) => t.text)).toEqual(['http']);
    expect(of(src, T.CallbackArgs).map((t) => t.text)).toEqual(['x, y']);
  });

  it('keeps a run of line breaks around a comment line one token, ranges in order', () => {
    const src = 'gantt\na :1d\n\n%% c\n\nb :1d';
    const tokens = stream(src);
    const breaks = tokens.filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, clipped to the end of the source.
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\n', '\n\n%% c\n\n', '']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('gives a CRLF line break one token from its CR, and a bare section the next line', () => {
    const src = 'gantt\r\nsection\r\nfoo\r\na :1d\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\r\n', '\r\n', '\r\n']);
    expect(slices(src, T.Section)).toEqual([['section\nfoo', 'section\r\nfoo']]);
  });
});

// The quirks spec #293 lists for T1: v12's lexer did these, so v13's does too.
describe('v12 lexer quirks', () => {
  it('drops a line whose first token is one character and a `%`', () => {
    const src = 'gantt\na :1d\n5% buffer :3d\nb :1d';
    expect(of(src, T.TaskText).map((t) => t.text)).toEqual(['a ', 'b ']);
    expect(comments(src)).toEqual(['5% buffer :3d']);
  });

  it('lexes `accDescription` (no grammar rule takes it)', () => {
    expect(of('gantt\naccDescription a b;c', T.AccDescription).map((t) => t.text)).toEqual([
      'accDescription a b',
    ]);
  });

  it('reads a leading `;` or `#` as task text, and `#` after task data as task text', () => {
    const src = 'gantt\n;a :1d\n#b :2d #c';
    expect(of(src, T.TaskText).map((t) => t.text)).toEqual([';a ', '#b ', '#c']);
    expect(of(src, T.TaskData).map((t) => t.text)).toEqual([':1d', ':2d ']);
  });

  it('lexes an ISO date at a token start as a date, and keyword prefixes as keywords', () => {
    const kinds = (src: string) => ganttTokens(src).map((t) => t.kind);
    expect(kinds('gantt\n2020-01-01 x :1d')).toEqual([
      T.Gantt,
      Kind.Newline,
      T.Date,
      T.TaskText,
      T.TaskData,
      Kind.Newline,
      T.Eof,
    ]);
    expect(of('gantt\nweekend friday party :1d', T.WeekendFriday)).toHaveLength(1);
    expect(of('gantt\nganttä :1d', T.Gantt)).toHaveLength(2);
    expect(of('gantt\nclick me :1d', T.ClickId).map((t) => t.text)).toEqual(['me']);
  });

  it('writes the token after an unopened `%%{` as an error, as jison threw there', () => {
    const tokens = ganttTokens('gantt\n2020-01-01%%{ ;x\na :1d');
    const at = tokens.findIndex((t) => t.kind === T.OpenDirective);
    expect(tokens[at + 1]?.kind).toBe(Kind.Error);
    expect(tokens[at + 1]?.text).toBe(' ;x');
    // Lexing goes on after it, for the parser's recovery.
    expect(tokens.slice(at).map((t) => t.text)).toEqual(['%%{', ' ;x', '\n', 'a ', ':1d', '', '']);
  });
});
