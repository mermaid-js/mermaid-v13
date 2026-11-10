import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { eventModelingTokens, eventModelingView } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

/**
 * What the lexer-parity gate (`packages/conformance/src/eventmodeling/lexer-parity.spec.ts`)
 * cannot see: source ranges, the spans v12 removed before lexing, and what follows the first
 * error. The streams under "rules" are what 2.0.1's lexer gives for the same text (probed), with
 * an `Error` token where it reports an error.
 */
const stream = (src: string) => {
  const { bodyStart, view } = eventModelingView(src);
  const s = lex(src, bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);
const lexed = (src: string) => eventModelingTokens(src).map((t) => [t.kind, t.text]);

describe('comments and removed spans', () => {
  it('keeps comment lines as tokens (v12 lexed withComments), and cuts directives', () => {
    const src = 'eventmodeling\n%% one\n%%{init: {}}%%\ntf 01 evt A %% two\n  %% three';
    expect(lexed(src)).toEqual([
      [T.Header, 'eventmodeling'],
      [Kind.Comment, '%% one'],
      [T.Tf, 'tf'],
      [T.FrameId, '01'],
      [T.Evt, 'evt'],
      [T.Id, 'A'],
      [Kind.Comment, '%% two'],
      [Kind.Comment, '%% three'],
    ]);
    const tokens = stream(src);
    expect(tokens.filter((t) => t.kind === Kind.Directive).map((t) => slice(src, t))).toEqual([
      '%%{init: {}}%%',
    ]);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('keeps a comment line after a directive that starts the text', () => {
    const src = '%%{init: {}}%%\n%% c\neventmodeling';
    expect(lexed(src)).toEqual([
      [Kind.Comment, '%% c'],
      [T.Header, 'eventmodeling'],
    ]);
  });

  it('gives a data block split by a comment line one token, its range over the comment', () => {
    const src = 'eventmodeling\ndata D {\n%% c\n  a\n}';
    const blocks = eventModelingTokens(src).filter((t) => t.kind === T.DataBlock);
    expect(blocks.map((t) => t.text)).toEqual(['{\n%% c\n  a\n}']);
    expect(slice(src, blocks[0]?.range ?? { start: 0, end: 0 })).toBe('{\n%% c\n  a\n}');
  });

  it('reads CRLF and a lone CR as LF in images', () => {
    expect(lexed('eventmodeling\r\ndata D {\r\n  a\r}\r').slice(3)).toEqual([
      [T.DataBlock, '{\n  a\n}\n'],
    ]);
  });
});

describe('rules', () => {
  it('reads title and the accessibility rules only after blanks on the same line', () => {
    expect(lexed('eventmodeling title My Model\ntitle X\ntf 01 evt titleBar')).toEqual([
      [T.Header, 'eventmodeling'],
      [T.Title, ' title My Model'],
      [T.Id, 'title'],
      [T.Id, 'X'],
      [T.Tf, 'tf'],
      [T.FrameId, '01'],
      [T.Evt, 'evt'],
      [T.Title, ' title'],
      [T.Id, 'Bar'],
    ]);
  });

  it('reads keywords only as whole words, and eventmodeling only before a space or %%', () => {
    expect(lexed('eventmodeling-beta tf01 evtA text')).toEqual([
      [T.Id, 'eventmodeling'],
      [Kind.Error, '-'],
      [T.Id, 'beta'],
      [T.Id, 'tf01'],
      [T.Id, 'evtA'],
      [T.Text, 'text'],
    ]);
  });

  it('takes inline data greedily to the last closer on its line', () => {
    expect(
      lexed('eventmodeling tf 01 evt A { a } tf 02 evt B { b }\ntf 03 evt C').slice(5)
    ).toEqual([
      [T.DataInline, '{ a } tf 02 evt B { b }'],
      [T.Tf, 'tf'],
      [T.FrameId, '03'],
      [T.Evt, 'evt'],
      [T.Id, 'C'],
    ]);
  });

  it('closes a data block at the first closing line after a line break in its body', () => {
    expect(lexed('eventmodeling\ndata D {\n}\ntf 01 evt A\n}\nnote 01 {\n}').slice(3)).toEqual([
      [T.DataBlock, '{\n}\ntf 01 evt A\n}\n'],
      [T.Note, 'note'],
      [T.FrameId, '01'],
      [T.DataBlock, '{\n}'],
    ]);
  });

  it('splits frame ids after three digits', () => {
    expect(lexed('eventmodeling tf 1234 evt A').slice(1, 4)).toEqual([
      [T.Tf, 'tf'],
      [T.FrameId, '123'],
      [T.FrameId, '4'],
    ]);
  });

  it('writes one Error over the characters Chevrotain skipped, then lexes on', () => {
    expect(lexed('eventmodeling tf 01 evt Café ## { x').slice(4)).toEqual([
      [T.Id, 'Caf'],
      [Kind.Error, 'é'],
      [Kind.Error, '##'],
      [Kind.Error, '{'],
      [T.Id, 'x'],
    ]);
  });
});
