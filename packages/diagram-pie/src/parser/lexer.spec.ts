import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { pieTokens } from './index.ts';
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
const of = (src: string, kind: number) => pieTokens(src).filter((t) => t.kind === kind);
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a token
// that runs over one stays one token (the parity gate would not see a split of these, pitfall 4).
describe('tokens across removed spans', () => {
  it('keeps an accDescr {…} body split by a comment line one token', () => {
    const src = 'pie\naccDescr {\na\n%% c\nb\n}\n"x": 1';
    const values = of(src, T.AccDescr);
    expect(values.map((t) => t.text)).toEqual(['accDescr {\na\nb\n}']);
    expect(slice(src, values[0]?.range ?? { start: 0, end: 0 })).toBe('accDescr {\na\n%% c\nb\n}');
  });

  it('keeps a string split by a comment line one token', () => {
    const src = 'pie\n"a\n%% c\nb": 1';
    expect(of(src, T.String).map((t) => t.text)).toEqual(['"a\nb"']);
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = 'pie\n%% one\n"a": 1 %% two\n%%{init: {}}%%\n"b": 2';
    const tokens = stream(src);
    const trivia = tokens.filter((t) => t.kind === Kind.Comment || t.kind === Kind.Directive);
    expect(trivia.map((t) => [t.kind, slice(src, t)])).toEqual([
      [Kind.Comment, '%% one\n'],
      // Left in the text v12 lexed: a hidden SINGLE_LINE_COMMENT.
      [Kind.Comment, '%% two'],
      [Kind.Directive, '%%{init: {}}%%'],
    ]);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    // pieTokens leaves out what v12 removed and keeps what its lexer saw.
    expect(of(src, Kind.Comment).map((t) => t.text)).toEqual(['%% two']);
    expect(of(src, Kind.Directive)).toEqual([]);
  });

  it('gives a CRLF line break one token from its CR, and a lone CR one too', () => {
    const src = 'pie\r\n"a": 1\r"b": 2\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, zero-width at the end of the source.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r\n', '']);
    expect(of(src, Kind.Newline).map((t) => t.text)).toEqual(['\n', '\n', '\n', '']);
  });

  it('reads tag quotes, entities and a dropped semicolon as v12 did', () => {
    const src = 'pie\ntitle style x:#f00;\n"<b c="d">#quot;</b>": 1';
    expect(of(src, T.Title).map((t) => [t.text, slice(src, t.range)])).toEqual([
      ['title style x:#f00', 'title style x:#f00;'],
    ]);
    expect(of(src, T.String).map((t) => t.text)).toEqual(['"<b c=\'d\'>&quot;</b>"']);
  });
});

describe('rules', () => {
  it('backtracks numbers as the regex does', () => {
    const numbers = (src: string) => of(src, T.Number).map((t) => t.text);
    expect(numbers('pie\n"a": 12.')).toEqual(['1']);
    expect(numbers('pie\n"a": 1.23.')).toEqual(['1.2']);
    expect(numbers('pie\n"a": 01')).toEqual(['0', '1']);
    expect(numbers('pie\n"a": -0 00.5 -12.50')).toEqual(['-0', '00.5', '-12.50']);
  });

  it('writes one Error over the characters Chevrotain skipped, then lexes on', () => {
    const src = 'pie\n"a": 1;;;\n"b": 2';
    const kinds = pieTokens(src).map((t) => [t.kind, t.text]);
    expect(kinds.slice(5, 8)).toEqual([
      [Kind.Error, ';;;'],
      [Kind.Newline, '\n'],
      [T.String, '"b"'],
    ]);
  });

  it('keeps the blanks before title and accessibility values in their tokens', () => {
    const src = 'pie\n  title  a  %% c\n\taccTitle : b\n accDescr: c';
    expect(pieTokens(src).map((t) => t.text)).toContain('  title  a  ');
    expect(of(src, T.AccTitle).map((t) => t.text)).toEqual(['\taccTitle : b']);
    expect(of(src, T.AccDescr).map((t) => t.text)).toEqual([' accDescr: c']);
  });

  it('lexes a YAML block in the body as hidden trivia', () => {
    const src = 'pie\n---\nx: 1\n---\n"a": 1';
    expect(of(src, T.Yaml).map((t) => t.text)).toEqual(['---\nx: 1\n---\n']);
  });
});
