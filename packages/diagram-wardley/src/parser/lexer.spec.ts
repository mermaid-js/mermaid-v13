import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { wardleyTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

/**
 * What the lexer-parity gate (`packages/conformance/src/wardley/lexer-parity.spec.ts`) cannot
 * see: source ranges, the spans v12 removed before lexing, and what follows the first error.
 * The streams under "rules" are what 2.0.1's lexer gives for the same text (probed), with an
 * `Error` token where it reports an error.
 */
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
const of = (src: string, kind: number) => wardleyTokens(src).filter((t) => t.kind === kind);
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);
const lexed = (src: string) => wardleyTokens(src).map((t) => [t.kind, t.text]);

describe('tokens across removed spans', () => {
  it('keeps a note split by a comment line one token, its range over the comment', () => {
    const src = 'wardley-beta\nnote "a\n%% c\nb" [0.5, 0.5]';
    const notes = of(src, T.String);
    expect(notes.map((t) => t.text)).toEqual(['"a\nb"']);
    expect(slice(src, notes[0]?.range ?? { start: 0, end: 0 })).toBe('"a\n%% c\nb"');
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = 'wardley-beta\n%% one\ncomponent A [0.5, 0.5] %% two\n%%{init: {}}%%\nA -> B';
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
    expect(of(src, Kind.Comment).map((t) => t.text)).toEqual(['%% two']);
    expect(of(src, Kind.Directive)).toEqual([]);
  });

  it('gives a CRLF line break one token, a lone CR one too, even at the end', () => {
    const src = 'wardley-beta\r\nA -> B\rB -> C\r';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, zero-width at the end of the source.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r', '']);
  });
});

describe('rules', () => {
  it('splits names that start with a keyword or a strategy (D423)', () => {
    expect(lexed('wardley-beta\nnotebook -> buyer')).toEqual([
      [T.WardleyBeta, 'wardley-beta'],
      [Kind.Newline, '\n'],
      [T.Note, 'note'],
      [T.Name, 'book'],
      [T.Arrow, '->'],
      [T.Strategy, 'buy'],
      [T.Name, 'er'],
      [Kind.Newline, ''],
    ]);
  });

  it('reads blank-separated words as one name, and a dash before > as an arrow', () => {
    expect(lexed('wardley-beta\nreal-time  data--> A (b)').slice(2)).toEqual([
      [T.Name, 'real-time  data-'],
      [T.Arrow, '->'],
      [T.Name, 'A (b)'],
      [Kind.Newline, ''],
    ]);
  });

  it('reads title, accTitle and accDescr only where the name rule stops', () => {
    expect(lexed('wardley-beta\ntitle A\ntitled\ntitle\naccTitleX').slice(2)).toEqual([
      [T.Title, 'title A'],
      [Kind.Newline, '\n'],
      [T.Name, 'titled'],
      [Kind.Newline, '\n'],
      [T.Title, 'title'],
      [Kind.Newline, '\n'],
      [T.Id, 'accTitleX'],
      [Kind.Newline, ''],
    ]);
  });

  it('writes one Error over the characters Chevrotain skipped, then lexes on', () => {
    expect(lexed('wardley-beta\nA ::> B\ncomponent über')).toEqual([
      [T.WardleyBeta, 'wardley-beta'],
      [Kind.Newline, '\n'],
      [T.Name, 'A'],
      [Kind.Error, '::'],
      [T.LinkArrow, '>'],
      [T.Name, 'B'],
      [Kind.Newline, '\n'],
      [T.Component, 'component'],
      [Kind.Error, 'ü'],
      [T.Name, 'ber'],
      [Kind.Newline, ''],
    ]);
  });

  it('backtracks integers as the regex does, and never reads an integer as a decimal', () => {
    expect(lexed('wardley-beta\n[12., 01, 0.5, 1]').slice(2, 11)).toEqual([
      [T.LBracket, '['],
      [T.Int, '1'],
      [T.Id, '2'],
      [Kind.Error, '.'],
      [T.Comma, ','],
      [T.Int, '0'],
      [T.Int, '1'],
      [T.Comma, ','],
      [T.Decimal, '0.5'],
    ]);
  });

  it('reads a port label to the first quote, across lines, and +<> before +<', () => {
    expect(lexed("wardley-beta\nA +'x\ny'<> B +<> C").slice(2, 7)).toEqual([
      [T.Name, 'A'],
      [T.LinkArrow, "+'x\ny'<>"],
      [T.Name, 'B'],
      [T.LinkPort, '+<>'],
      [T.Name, 'C'],
    ]);
  });
});
