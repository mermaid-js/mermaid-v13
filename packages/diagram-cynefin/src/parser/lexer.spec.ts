import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { cynefinTokens } from './index.ts';
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
const of = (src: string, kind: number) => cynefinTokens(src).filter((t) => t.kind === kind);
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a token
// that runs over one stays one token (the parity gate would not see a split of these, pitfall 4).
describe('tokens across removed spans', () => {
  it('keeps an accDescr {…} body split by a comment line one token', () => {
    const src = 'cynefin-beta\naccDescr {\na\n%% c\nb\n}\ncomplex';
    const values = of(src, T.AccDescr);
    expect(values.map((t) => t.text)).toEqual(['accDescr {\na\nb\n}']);
    expect(slice(src, values[0]?.range ?? { start: 0, end: 0 })).toBe('accDescr {\na\n%% c\nb\n}');
  });

  it('keeps an item split by a comment line one token', () => {
    const src = 'cynefin-beta\ncomplex\n"a\n%% c\nb"';
    expect(of(src, T.String).map((t) => t.text)).toEqual(['"a\nb"']);
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = 'cynefin-beta\n%% one\ncomplex "a" %% two\n%%{init: {}}%%\nclear --> complex';
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
    // cynefinTokens leaves out what v12 removed and keeps what its lexer saw.
    expect(of(src, Kind.Comment).map((t) => t.text)).toEqual(['%% two']);
    expect(of(src, Kind.Directive)).toEqual([]);
  });

  it('gives a CRLF line break one token from its CR, and a lone CR one too', () => {
    const src = 'cynefin-beta\r\ncomplex\r"a"\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, zero-width at the end of the source.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r\n', '']);
    expect(of(src, Kind.Newline).map((t) => t.text)).toEqual(['\n', '\n', '\n', '']);
  });
});

describe('rules', () => {
  const kinds = (src: string) =>
    cynefinTokens(src)
      .filter((t) => t.kind !== Kind.Newline)
      .map((t) => [t.kind, t.text]);

  it('takes the first rule in order: the colon header, then domain names with no boundary', () => {
    expect(kinds('cynefin-beta:complex')).toEqual([
      [T.HeaderColon, 'cynefin-beta:'],
      [T.DomainName, 'complex'],
    ]);
    expect(kinds('cynefin-beta\ncomplexity')).toEqual([
      [T.Header, 'cynefin-beta'],
      [T.DomainName, 'complex'],
      [Kind.Error, 'ity'],
    ]);
  });

  it('keeps the blanks before a title after a domain name in its image', () => {
    expect(kinds('cynefin-beta\ncomplex title X')).toEqual([
      [T.Header, 'cynefin-beta'],
      [T.DomainName, 'complex'],
      [T.Title, ' title X'],
    ]);
  });

  it('lexes a transition with tabs and a glued label', () => {
    expect(kinds('cynefin-beta\ncomplex\t-->\tclear:"a"')).toEqual([
      [T.Header, 'cynefin-beta'],
      [T.DomainName, 'complex'],
      [T.Arrow, '-->'],
      [T.DomainName, 'clear'],
      [T.Colon, ':'],
      [T.String, '"a"'],
    ]);
  });
});
