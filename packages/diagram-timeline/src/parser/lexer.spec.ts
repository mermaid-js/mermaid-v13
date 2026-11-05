import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { timelineTokens } from './index.ts';
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
const of = (src: string, kind: number) => timelineTokens(src).filter((t) => t.kind === kind);
const slices = (src: string, kind: number) =>
  of(src, kind).map((t) => [t.text, src.slice(t.range.start, t.range.end)]);

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a
// token that runs over one stays one token (pitfall 4: the parity gate would not see a split).
describe('tokens across removed spans', () => {
  it('keeps a multi-line accessibility description split by a comment line one token', () => {
    const src = 'timeline\naccDescr {\na\n%% c\nb\n}\n2002 : x';
    const values = of(src, T.AccDescrMultilineValue);
    expect(values.map((t) => t.text)).toEqual(['a\nb\n']);
    expect(src.slice(values[0]?.range.start, values[0]?.range.end)).toBe('a\n%% c\nb\n');
  });

  it('keeps a period and an event split by a directive one token each', () => {
    const src = 'timeline\n20%%{init: {}}%%02 : x %%{init: {}}%%y\n2003 : z';
    expect(slices(src, T.Period)).toEqual([
      ['2002 ', '20%%{init: {}}%%02 '],
      ['2003 ', '2003 '],
    ]);
    expect(slices(src, T.Event)).toEqual([
      [': x y', ': x %%{init: {}}%%y'],
      [': z', ': z'],
    ]);
  });

  it('keeps a bare title and the line it takes, across a comment line, one token', () => {
    const src = 'timeline\ntitle\n%% c\nfoo\n2002 : x';
    expect(slices(src, T.Title)).toEqual([['title\nfoo', 'title\n%% c\nfoo']]);
  });

  it('keeps a run of line breaks around a comment line one token, ranges in order', () => {
    const src = 'timeline\n2002 : x\n\n%% c\n\n2003 : y';
    const tokens = stream(src);
    const breaks = tokens.filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, clipped to the end of the source.
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\n', '\n\n%% c\n\n', '']);
    const comments = tokens.filter((t) => t.kind === Kind.Comment);
    // v12's `^\s*%%…` took the blank line before the comment too.
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(['\n%% c\n']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('gives a CRLF line break one token from its CR, and a bare title the next line', () => {
    const src = 'timeline\r\ntitle\r\nfoo\r\n2002 : x\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last CRLF and the line break v12 appended are one run.
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\r\n', '\r\n', '\r\n']);
    expect(slices(src, T.Title)).toEqual([['title\nfoo', 'title\r\nfoo']]);
    expect(of(src, T.Event).map((t) => t.text)).toEqual([': x']);
  });

  it('writes the comments jison skipped as trivia, and entities as v12 read them', () => {
    const src = 'timeline\n2002 #quot;y#quot; # note : z\n%x\nC%%d : e';
    const tokens = stream(src);
    expect(
      tokens.filter((t) => t.kind === Kind.Comment).map((t) => src.slice(t.start, t.end))
    ).toEqual(['# note : z', '%x', 'C%%d : e']);
    expect(of(src, T.Period).map((t) => t.text)).toEqual(['2002 &quot;y&quot; ']);
  });

  it('writes no token for the accDescr braces the parity gate leaves out', () => {
    const src = 'timeline\naccDescr { a }\n2002 : x';
    const kinds = timelineTokens(src).map((t) => t.kind);
    expect(kinds.slice(0, 5)).toEqual([
      T.Timeline,
      Kind.Newline,
      T.AccDescrMultiline,
      T.AccDescrMultilineValue,
      T.AccDescrMultilineEnd,
    ]);
    expect(kinds.at(-1)).toBe(T.Eof);
  });
});
