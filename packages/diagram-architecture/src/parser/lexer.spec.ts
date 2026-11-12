import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { architectureTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

/**
 * What the lexer-parity gate (`packages/conformance/src/architecture/lexer-parity.spec.ts`)
 * cannot see: source ranges, the spans v12 removed before lexing, and what follows the first
 * error. The streams under "rules" are what 2.0.1's lexer gives for the same text (probed), with
 * an `Error` token where it reports an error.
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
const of = (src: string, kind: number) => architectureTokens(src).filter((t) => t.kind === kind);
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);
const lexed = (src: string) => architectureTokens(src).map((t) => [t.kind, t.text]);
const H = 'architecture-beta\n';

describe('tokens across removed spans', () => {
  it('keeps a quoted label split by a comment line one token, its range over the comment', () => {
    const src = H + 'service a["x\n%% c\ny"]';
    const labels = of(src, T.Label);
    expect(labels.map((t) => t.text)).toEqual(['["x\ny"]']);
    expect(slice(src, labels[0]?.range ?? { start: 0, end: 0 })).toBe('["x\n%% c\ny"]');
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = H + '%% one\nservice a %% two\n%%{init: {}}%%\nservice b';
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
    const src = 'architecture-beta\r\nservice a\rservice b\r';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, zero-width at the end of the source.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r', '']);
  });
});

describe('rules', () => {
  it('splits names that start with a capital L, R, T or B, and keeps keywords as keywords', () => {
    expect(lexed(H + 'service Backend\nservice row\nservice rows').slice(2)).toEqual([
      [T.Service, 'service'],
      [T.Direction, 'B'],
      [T.Id, 'ackend'],
      [Kind.Newline, '\n'],
      [T.Service, 'service'],
      [T.Row, 'row'],
      [Kind.Newline, '\n'],
      [T.Service, 'service'],
      [T.Id, 'rows'],
      [Kind.Newline, ''],
    ]);
  });

  it('reads an edge with arrowheads, a {group} end and a label', () => {
    expect(lexed(H + 'a{group}:R > -[x]- < L:b').slice(2)).toEqual([
      [T.Id, 'a'],
      [T.ArrowGroup, '{group}'],
      [T.Colon, ':'],
      [T.Direction, 'R'],
      [T.ArrowInto, '>'],
      [T.Dash, '-'],
      [T.Label, '[x]'],
      [T.Dash, '-'],
      [T.ArrowInto, '<'],
      [T.Direction, 'L'],
      [T.Colon, ':'],
      [T.Id, 'b'],
      [Kind.Newline, ''],
    ]);
  });

  it('gives title, accTitle and accDescr the blanks before them, and splits titlex', () => {
    expect(lexed(H + '  title A\nservice titlex').slice(2)).toEqual([
      [T.Title, '  title A'],
      [Kind.Newline, '\n'],
      [T.Service, 'service'],
      [T.Title, ' title'],
      [T.Id, 'x'],
      [Kind.Newline, ''],
    ]);
  });

  it('reads a quoted label across brackets and lines, else a run up to a bracket', () => {
    expect(lexed(H + 'service a["x]\ny"]\nservice b["p"q]').slice(4, 9)).toEqual([
      [T.Label, '["x]\ny"]'],
      [Kind.Newline, '\n'],
      [T.Service, 'service'],
      [T.Id, 'b'],
      [T.Label, '["p"q]'],
    ]);
  });

  it('writes one Error over the characters Chevrotain skipped, then lexes on', () => {
    expect(lexed(H + 'service a( server )[b [c] d]').slice(2)).toEqual([
      [T.Service, 'service'],
      [T.Id, 'a'],
      [Kind.Error, '('],
      [T.Id, 'server'],
      [Kind.Error, ')['],
      [T.Id, 'b'],
      [T.Label, '[c]'],
      [T.Id, 'd'],
      [Kind.Error, ']'],
      [Kind.Newline, ''],
    ]);
  });
});
