import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { radarTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

/**
 * What the lexer-parity gate (`packages/conformance/src/radar/lexer-parity.spec.ts`) cannot
 * see: source ranges, the spans v12 removed before lexing, and what follows the first error.
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
const of = (src: string, kind: number) => radarTokens(src).filter((t) => t.kind === kind);
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);

describe('tokens across removed spans', () => {
  it('keeps a label split by a comment line one token, its range over the comment', () => {
    const src = 'radar-beta\naxis A["a\n%% c\nb"]';
    const labels = of(src, T.String);
    expect(labels.map((t) => t.text)).toEqual(['"a\nb"']);
    expect(slice(src, labels[0]?.range ?? { start: 0, end: 0 })).toBe('"a\n%% c\nb"');
  });

  it('keeps an accDescr {…} body split by a comment line one token', () => {
    const src = 'radar-beta\naccDescr {\na\n%% c\nb\n}\naxis A';
    expect(of(src, T.AccDescr).map((t) => t.text)).toEqual(['accDescr {\na\nb\n}']);
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = 'radar-beta\n%% one\naxis A %% two\n%%{init: {}}%%\ncurve c{1}';
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

  it('gives a CRLF line break one token from its CR, and a lone CR one too', () => {
    const src = 'radar-beta\r\naxis A\rcurve c{1}\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, zero-width at the end of the source.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r\n', '']);
  });
});

describe('rules', () => {
  it('splits names that start with a terminal, and lets keywords yield to longer names', () => {
    const src = 'radar-beta\naxis circles, maxi, titleX';
    expect(radarTokens(src).map((t) => [t.kind, t.text])).toEqual([
      [T.RadarBeta, 'radar-beta'],
      [Kind.Newline, '\n'],
      [T.Axis, 'axis'],
      [T.GraticuleValue, 'circle'],
      [T.Id, 's'],
      [T.Comma, ','],
      [T.Id, 'maxi'],
      [T.Comma, ','],
      // TITLE's last alternative is empty: ` title`, then the name `X`.
      [T.Title, ' title'],
      [T.Id, 'X'],
      [Kind.Newline, ''],
    ]);
  });

  it('writes one Error over the characters Chevrotain skipped, then lexes on', () => {
    const src = 'radar-beta\naxis A;;@\naxis über';
    expect(radarTokens(src).map((t) => [t.kind, t.text])).toEqual([
      [T.RadarBeta, 'radar-beta'],
      [Kind.Newline, '\n'],
      [T.Axis, 'axis'],
      [T.Id, 'A'],
      [Kind.Error, ';;@'],
      [Kind.Newline, '\n'],
      [T.Axis, 'axis'],
      [Kind.Error, 'ü'],
      [T.Id, 'ber'],
      [Kind.Newline, ''],
    ]);
  });

  it('backtracks numbers as the regex does', () => {
    const lexed = (src: string) => radarTokens(src).map((t) => [t.kind, t.text]);
    expect(lexed('radar-beta\nticks 12.').slice(3, 6)).toEqual([
      [T.Number, '1'],
      [T.Id, '2'],
      [Kind.Error, '.'],
    ]);
    expect(lexed('radar-beta\nticks 01 0. 1.23.').slice(3, 8)).toEqual([
      [T.Number, '0'],
      [T.Number, '1'],
      [T.Number, '0'],
      [Kind.Error, '.'],
      [T.Number, '1.2'],
    ]);
  });
});
