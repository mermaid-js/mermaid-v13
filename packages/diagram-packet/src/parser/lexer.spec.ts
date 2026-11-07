import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { packetTokens } from './index.ts';
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
const of = (src: string, kind: number) => packetTokens(src).filter((t) => t.kind === kind);
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);
const kinds = (src: string) => packetTokens(src).map((t) => [t.kind, t.text]);

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a token
// that runs over one stays one token, with a range over the source (pitfall 4). The parity gate
// compares token text only, never ranges.
describe('tokens across removed spans', () => {
  it('keeps an accDescr {…} body split by a comment line one token', () => {
    const src = 'packet\naccDescr {\na\n%% c\nb\n}\n0: "x"';
    const values = of(src, T.AccDescr);
    expect(values.map((t) => t.text)).toEqual(['accDescr {\na\nb\n}']);
    expect(slice(src, values[0]?.range ?? { start: 0, end: 0 })).toBe('accDescr {\na\n%% c\nb\n}');
  });

  it('keeps a string split by a comment line one token', () => {
    const src = 'packet\n0: "a\n%% c\nb"';
    const strings = of(src, T.String);
    expect(strings.map((t) => t.text)).toEqual(['"a\nb"']);
    expect(slice(src, strings[0]?.range ?? { start: 0, end: 0 })).toBe('"a\n%% c\nb"');
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = 'packet\n%% one\n0: "a" %% two\n%%{init: {}}%%\n+8: "b"';
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
    // packetTokens leaves out what v12 removed and keeps what its lexer saw.
    expect(of(src, Kind.Comment).map((t) => t.text)).toEqual(['%% two']);
    expect(of(src, Kind.Directive)).toEqual([]);
  });

  it('gives a CRLF line break one token from its CR, and a lone CR one too', () => {
    const src = 'packet\r\n0: "a"\r1: "b"\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, zero-width at the end of the source.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r\n', '']);
  });
});

describe('rules', () => {
  it('backtracks INT as the regex does', () => {
    const ints = (src: string) => of(src, T.Int).map((t) => t.text);
    expect(ints('packet\n01: "a"')).toEqual(['0', '1']);
    expect(ints('packet\n10.')).toEqual(['1', '0']);
    expect(ints('packet\n1e3')).toEqual(['1', '3']);
    expect(ints('packet\n1.5')).toEqual(['5']);
  });

  it('reads -, + and : with blanks around them, and a YAML block as hidden trivia', () => {
    expect(kinds('packet\n0 - 10 : "a"\n+ 8: "b"').slice(2)).toEqual([
      [T.Int, '0'],
      [T.Dash, '-'],
      [T.Int, '10'],
      [T.Colon, ':'],
      [T.String, '"a"'],
      [Kind.Newline, '\n'],
      [T.Plus, '+'],
      [T.Int, '8'],
      [T.Colon, ':'],
      [T.String, '"b"'],
      [Kind.Newline, ''],
    ]);
    expect(of('packet\n0: "a"\n---\nx: 1\n---\n1: "b"', T.Yaml).map((t) => t.text)).toEqual([
      '---\nx: 1\n---\n',
    ]);
  });

  it('takes packet-beta without a boundary and packet only before a blank, %% or the end', () => {
    expect(kinds('packet-beta0: "a"').slice(0, 2)).toEqual([
      [T.PacketBeta, 'packet-beta'],
      [T.Int, '0'],
    ]);
    // v12 raises its lexer error at the start of both; v13 writes an Error there.
    expect(kinds('packetx\n0: "a"')[0]).toEqual([Kind.Error, 'packetx']);
    expect(kinds('PACKET\n0: "a"')[0]).toEqual([Kind.Error, 'PACKET']);
    expect(kinds('packet%%c\n0: "a"').slice(0, 2)).toEqual([
      [T.Packet, 'packet'],
      [Kind.Comment, '%%c'],
    ]);
  });

  it('writes one Error over the characters Chevrotain skipped, then lexes on', () => {
    expect(kinds('packet\n0: "a";;;\n1: "b"').slice(5, 8)).toEqual([
      [Kind.Error, ';;;'],
      [Kind.Newline, '\n'],
      [T.Int, '1'],
    ]);
  });

  it('keeps the blanks before title and accessibility values in their tokens', () => {
    const src = 'packet\n  title  a  %% c\n\taccTitle : b\n accDescr: c';
    expect(of(src, T.Title).map((t) => t.text)).toEqual(['  title  a  ']);
    expect(of(src, T.AccTitle).map((t) => t.text)).toEqual(['\taccTitle : b']);
    expect(of(src, T.AccDescr).map((t) => t.text)).toEqual([' accDescr: c']);
  });
});
