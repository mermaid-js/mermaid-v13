import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { CHEVROTAIN_NAMES, lex, usecaseTokens, usecaseView } from './index.ts';
import { T } from './tokens.ts';

/**
 * What the lexer-parity gate (`packages/conformance/src/usecase/lexer-parity.spec.ts`) cannot
 * see: source ranges, the spans v12 removed before lexing, one token per v12 token where a
 * removed span splits it (pitfall 4: the gate compares images, which a split would keep), and
 * what follows the first error. The streams under "rules" are what 12.2.0's lexer gives for
 * the same text (probed through the oracle).
 */
const stream = (src: string) => {
  const { bodyStart, view } = usecaseView(src);
  const { tokens: s } = lex(src, bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);
const named = (src: string) =>
  usecaseTokens(src).map((t) => `${CHEVROTAIN_NAMES[t.kind] ?? t.kind}:${t.text}`);
const H = 'usecase-beta\n';

describe('tokens across removed spans', () => {
  it('keeps a markdown string split by a comment line one token, its range over the comment', () => {
    const src = H + 'A("`a\n%% c\nb`")';
    const md = usecaseTokens(src).filter((t) => t.kind === T.MarkdownString);
    expect(md.map((t) => t.text)).toEqual(['"`a\nb`"']);
    expect(slice(src, md[0]?.range ?? { start: 0, end: 0 })).toBe('"`a\n%% c\nb`"');
  });

  it('keeps an id split by a directive one token', () => {
    const src = H + 'ab%%{init: {}}%%cd --> B';
    const ids = usecaseTokens(src).filter((t) => t.kind === T.Identifier);
    expect(ids.map((t) => [t.text, slice(src, t.range)])).toEqual([
      ['abcd', 'ab%%{init: {}}%%cd'],
      ['B', 'B'],
    ]);
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = H + '%% one\nactor A\n%%{init: {}}%%\n  %%\nA --> B';
    const tokens = stream(src);
    const trivia = tokens.filter((t) => t.kind === Kind.Comment || t.kind === Kind.Directive);
    expect(trivia.map((t) => [t.kind, slice(src, t)])).toEqual([
      [Kind.Comment, '%% one\n'],
      [Kind.Directive, '%%{init: {}}%%'],
      // Left in the text v12 lexed: its COMMENT token.
      [Kind.Comment, '%%'],
    ]);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(usecaseTokens(src).filter((t) => t.kind === Kind.Comment)).toHaveLength(1);
  });

  it('gives a CRLF one line break, a lone CR one too, and the appended one zero width', () => {
    const src = H.replace('\n', '\r\n') + 'actor A\rA --> B\r';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r', '\r', '']);
  });

  it('gives a CR and an LF a directive separates two line breaks, as v12 saw them', () => {
    const src = H + 'actor A\r%%{init: {}}%%\nB';
    expect(named(src)).toEqual([
      'USECASE:usecase-beta',
      'NEWLINE:\n',
      'ACTOR:actor',
      'IDENTIFIER:A',
      'NEWLINE:\n',
      'NEWLINE:\n',
      'IDENTIFIER:B',
      'NEWLINE:',
    ]);
  });

  it('extends a token over the ; v12 dropped from a style line', () => {
    const src = H + 'style A fill:#f00;';
    const hash = usecaseTokens(src).find((t) => t.kind === T.HashColor);
    expect(hash && [hash.text, slice(src, hash.range)]).toEqual(['#f00', '#f00;']);
  });
});

describe('entities', () => {
  it('splits a placeholder as v12 did, each part on its source character', () => {
    const src = H + 'A[#amp; #35;]';
    const tokens = usecaseTokens(src).slice(4, 10);
    expect(tokens.map((t) => [CHEVROTAIN_NAMES[t.kind], t.text, slice(src, t.range)])).toEqual([
      ['LABEL_SYMBOL', '&', '#'],
      ['IDENTIFIER', 'amp', 'amp'],
      ['LABEL_SYMBOL', ';', ';'],
      ['LABEL_SYMBOL', '&#', '#'],
      ['IDENTIFIER', '35', '35'],
      ['LABEL_SYMBOL', ';', ';'],
    ]);
  });

  it('joins a placeholder with the symbols around it, and keeps words in it words', () => {
    expect(named(H + 'A[ä#end;ö]').slice(4, 7)).toEqual([
      'LABEL_SYMBOL:ä&',
      'END:end',
      'LABEL_SYMBOL:;ö',
    ]);
  });
});

describe('rules', () => {
  it('gives a longer word run the identifier, and a longer decimal the number', () => {
    expect(named(H + 'actor actors actor-x TBD 1mg 1.5px .5 1.')).toEqual([
      'USECASE:usecase-beta',
      'NEWLINE:\n',
      'ACTOR:actor',
      'IDENTIFIER:actors',
      'ACTOR:actor',
      'DASH:-',
      'IDENTIFIER:x',
      'IDENTIFIER:TBD',
      'IDENTIFIER:1mg',
      'NUMBER:1.5px',
      'NUMBER:.5',
      'IDENTIFIER:1',
      'DOT:.',
      'NEWLINE:',
    ]);
  });

  it('takes the first operator that matches, greedy dash runs included', () => {
    expect(named(H + 'A ---o B --xyz o--> <---- ---->').slice(2)).toEqual([
      'IDENTIFIER:A',
      'MARKERLESS_SOLID:---',
      'IDENTIFIER:o',
      'IDENTIFIER:B',
      'FORWARD_CROSS:--x',
      'IDENTIFIER:yz',
      'BACKWARD_CIRCLE:o--',
      'LABEL_PUNCTUATION:>',
      'BACKWARD_SOLID:<----',
      'FORWARD_SOLID:---->',
      'NEWLINE:',
    ]);
  });

  it('reads stereotype text to the first >> on its line, else the rest of the line', () => {
    expect(named(H + 'A << x >>\nB <<y\nC << >>').slice(2)).toEqual([
      'IDENTIFIER:A',
      'STEREOTYPE_START:<<',
      'STEREOTYPE_TEXT: x ',
      'STEREOTYPE_END:>>',
      'NEWLINE:\n',
      'IDENTIFIER:B',
      'STEREOTYPE_START:<<',
      'UNCLOSED_STEREOTYPE_TEXT:y',
      'NEWLINE:\n',
      'IDENTIFIER:C',
      'STEREOTYPE_START:<<',
      'UNCLOSED_STEREOTYPE_TEXT: >>',
      'NEWLINE:',
    ]);
  });

  it('writes one error over what no rule takes and lexes on, as Chevrotain does', () => {
    const src = H + 'A("x\nB';
    const tokens = usecaseTokens(src);
    const error = tokens.find((t) => t.kind === Kind.Error);
    expect(error && slice(src, error.range)).toBe('"');
    expect(tokens.slice(-3).map((t) => CHEVROTAIN_NAMES[t.kind] ?? t.kind)).toEqual([
      'NEWLINE',
      'IDENTIFIER',
      'NEWLINE',
    ]);
  });

  it('stays in stereotype mode over a line break, as Chevrotain does', () => {
    const src = H + 'A <<\nB';
    const kinds = usecaseTokens(src).map((t) => t.kind);
    expect(kinds.slice(-4)).toEqual([
      T.StereotypeStart,
      Kind.Error,
      T.UnclosedStereotypeText,
      Kind.Newline,
    ]);
  });

  it('reads the accessibility lines only at a line start', () => {
    expect(named(H + '  accTitle: t\nA accTitle: t').slice(2, 4)).toEqual([
      'ACC_TITLE_LINE:accTitle: t',
      'NEWLINE:\n',
    ]);
    expect(named(H + 'A accTitle: t')[3]).toBe('IDENTIFIER:accTitle');
  });

  it('starts at the first non-blank after the front matter, as v12 trimmed it', () => {
    const src = '---\ntitle: T\n---\n\n  \tusecase-beta\nA';
    const first = usecaseTokens(src)[0];
    expect(first && [first.text, first.at, slice(src, first.range)]).toEqual([
      'usecase-beta',
      0,
      'usecase-beta',
    ]);
  });
});
