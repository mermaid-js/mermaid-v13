import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { LEXERS, railroadTokens, railroadView } from './index.ts';
import type { RailroadNotation } from './index.ts';
import { T } from './tokens.ts';

/**
 * What the lexer-parity gates (`packages/conformance/src/railroad/lexer-parity-*.spec.ts`)
 * cannot see, for what the four lexers share (`lexer.ts`): source ranges, the spans v12 removed
 * before lexing, one token per v12 token across them (pitfall 4), and what follows the first
 * error. The streams are what 2.0.1's lexers give for the same text (probed), with an `Error`
 * token where they report an error.
 */
const stream = (notation: RailroadNotation, src: string) => {
  const { bodyStart, view } = railroadView(src);
  const s = LEXERS[notation](src, bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const slice = (src: string, t: { start: number; end: number }) => src.slice(t.start, t.end);
const lexed = (notation: RailroadNotation, src: string) =>
  railroadTokens(notation, src).map((t) => [t.kind, t.text]);

describe('tokens across removed spans', () => {
  it('keeps a string split by a comment line one token, its range over the comment', () => {
    const src = 'railroad-ebnf-beta\na = "x\n%% c\ny" ;';
    const strings = railroadTokens('railroadEbnf', src).filter((t) => t.kind === T.String);
    expect(strings.map((t) => t.text)).toEqual(['"x\ny"']);
    expect(slice(src, strings[0]?.range ?? { start: 0, end: 0 })).toBe('"x\n%% c\ny"');
  });

  it('keeps a special sequence split by comment lines one token', () => {
    const src = 'railroad-ebnf-beta\na = ? x\n  %% c\n  %% d\ny ? ;';
    expect(lexed('railroadEbnf', src).filter(([k]) => k === T.Special)).toEqual([
      [T.Special, '? x\ny ?'],
    ]);
  });

  it('writes each removed span as trivia, ranges in source order', () => {
    const src = 'railroad-beta\n%% one\na = terminal("x") ; %% two\n%%{init: {}}%%\nb = c ;';
    const tokens = stream('railroad', src);
    const trivia = tokens.filter((t) => t.kind === Kind.Comment || t.kind === Kind.Directive);
    expect(trivia.map((t) => [t.kind, slice(src, t)])).toEqual([
      [Kind.Comment, '%% one\n'],
      // Left in the text v12 lexed: a hidden SINGLE_LINE_COMMENT.
      [Kind.Comment, '%% two'],
      [Kind.Directive, '%%{init: {}}%%'],
    ]);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(railroadTokens('railroad', src).filter((t) => t.kind === Kind.Comment)).toHaveLength(1);
  });

  it('gives the `;` v12 dropped from a style line to the token before it', () => {
    // v12's encodeEntities dropped the last `;` of `style…:…#…;`, so its lexer never saw it.
    const src = 'railroad-ebnf-beta\nstyle = ":#" ;';
    const tokens = railroadTokens('railroadEbnf', src);
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      [T.Header, 'railroad-ebnf-beta'],
      [T.Id, 'style'],
      [T.Equals, '='],
      [T.String, '":#"'],
    ]);
  });
});

describe('the text v12 lexed', () => {
  it('reads CRLF and CR as LF in images, with ranges over the source', () => {
    const src = 'railroad-peg-beta\r\ntitle a\r\nb <- "x\r\ny" ;\r';
    const tokens = railroadTokens('railroadPeg', src);
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      [T.Header, 'railroad-peg-beta'],
      [T.Title, 'title a'],
      [T.Id, 'b'],
      [T.Arrow, '<-'],
      [T.String, '"x\ny"'],
      [T.Semi, ';'],
    ]);
    expect(slice(src, tokens[4]?.range ?? { start: 0, end: 0 })).toBe('"x\r\ny"');
  });

  it("turns tag attribute quotes into `'`, as v12 did, so a string can hold them", () => {
    expect(lexed('railroad', 'railroad-beta\na = terminal("<a href="x">") ;')[5]).toEqual([
      T.String,
      '"<a href=\'x\'>"',
    ]);
  });

  it('reads an entity where no rule takes its `#` (v12 placeholders)', () => {
    // PEG `#` starts a comment, but `#x;` was `ﬂ°x¶ß` in v12's text.
    expect(lexed('railroadPeg', 'railroad-peg-beta\na <- b ; #x; c')).toEqual([
      [T.Header, 'railroad-peg-beta'],
      [T.Id, 'a'],
      [T.Arrow, '<-'],
      [T.Id, 'b'],
      [T.Semi, ';'],
      [Kind.Error, '#'],
      [T.Id, 'x'],
      [Kind.Error, ';'],
      [T.Id, 'c'],
    ]);
    // Anywhere else in a comment it is comment text (images write entities as `&name;`).
    // A name core cannot decode stays as written (D559).
    expect(lexed('railroadPeg', 'railroad-peg-beta\n# see #lt; #x;')[1]).toEqual([
      T.HashComment,
      '# see &lt; #x;',
    ]);
    expect(lexed('railroad', 'railroad-beta\na = terminal("#amp;") ;')[5]).toEqual([
      T.String,
      '"&amp;"',
    ]);
  });

  it('skips leading blanks, and starts after front matter', () => {
    const src = '---\ntitle: x\n---\n   railroad-abnf-beta\na = "x"\n;';
    expect(lexed('railroadAbnf', src).slice(0, 2)).toEqual([
      [T.Header, 'railroad-abnf-beta'],
      [T.Id, 'a'],
    ]);
  });
});

describe('errors', () => {
  it('writes one Error over the characters no rule takes, then goes on', () => {
    const src = 'railroad-peg-beta\na <- [a-z] ;';
    expect(lexed('railroadPeg', src)).toEqual([
      [T.Header, 'railroad-peg-beta'],
      [T.Id, 'a'],
      [T.Arrow, '<-'],
      [Kind.Error, '['],
      [T.Id, 'a-z'],
      [Kind.Error, ']'],
      [T.Semi, ';'],
    ]);
  });

  it('errors at the quote of an unterminated string and lexes what follows it', () => {
    expect(lexed('railroad', 'railroad-beta\na = terminal("x) ;').slice(5)).toEqual([
      [Kind.Error, '"'],
      [T.Id, 'x'],
      [T.RParen, ')'],
      [T.Semi, ';'],
    ]);
  });

  it('never splits an astral character', () => {
    expect(lexed('railroad', 'railroad-beta\n\u{1F600}')).toEqual([
      [T.Header, 'railroad-beta'],
      [Kind.Error, '\u{1F600}'],
    ]);
  });

  it('errors on a `\\s` that is not `[\\t \\r\\n]`', () => {
    expect(lexed('railroadEbnf', 'railroad-ebnf-beta\na = "x" ;').slice(3, 5)).toEqual([
      [Kind.Error, ' '],
      [T.String, '"x"'],
    ]);
  });
});
