import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { bodyView } from '@mermaid-js/shared/parser/seen-tokens';
import { JISON_NAMES, vennTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

const stream = (src: string) => {
  const { bodyStart: from, view } = bodyView(src);
  const s = lex(src, from, view).tokens;
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => vennTokens(src).filter((t) => t.kind === kind);
/** Each token of `kind`: its text and its source slice. */
const slices = (src: string, kind: number) =>
  of(src, kind).map((t) => [t.text, src.slice(t.range.start, t.range.end)]);
/** jison terminal and text of each token with one, as the parity gate sees them. */
const jison = (src: string) =>
  vennTokens(src).flatMap((t) => {
    const name = JISON_NAMES[t.kind];
    return name ? [`${name}:${t.text}`] : [];
  });
/** The jison stream up to and including the first lexical error, as the gate cuts it. */
const cut = (src: string) => {
  const all = jison(src);
  const e = all.findIndex((t) => t.startsWith('LEXICAL_ERROR'));
  return e < 0 ? all : all.slice(0, e + 1);
};
const V = 'venn-beta\n';

// The expected streams below are v12's (the jison lexer oracle), for the quirks spec #429 lists.
describe('venn.jison quirks', () => {
  it('lexes a bare header as VENN NEWLINE EOF, and the header word-bounded', () => {
    expect(jison('venn-beta')).toEqual(['VENN:venn-beta', 'NEWLINE:', 'EOF:']);
    expect(jison('venn-betax\nset A').slice(0, 2)).toEqual(['IDENTIFIER:venn-betax', 'NEWLINE:\n']);
    expect(jison('venn-beta set A')).toEqual([
      'VENN:venn-beta',
      'SET:set',
      'IDENTIFIER:A',
      'NEWLINE:',
      'EOF:',
    ]);
    // v12 trims the blanks and line breaks before the header.
    expect(jison('\n\n  venn-beta\n\n\nset A\n\n').slice(0, 2)).toEqual([
      'VENN:venn-beta',
      'NEWLINE:\n\n\n',
    ]);
  });

  it('reads keywords case-insensitively and word-bounded, ids as written', () => {
    expect(jison(V + 'SET A\nUnion a,B\nTEXT A x\nStyle A')).toEqual([
      'VENN:venn-beta',
      'NEWLINE:\n',
      'SET:SET',
      'IDENTIFIER:A',
      'NEWLINE:\n',
      'UNION:Union',
      'IDENTIFIER:a',
      'COMMA:,',
      'IDENTIFIER:B',
      'NEWLINE:\n',
      'TEXT:TEXT',
      'IDENTIFIER:A',
      'IDENTIFIER:x',
      'NEWLINE:\n',
      'STYLE:Style',
      'IDENTIFIER:A',
      'NEWLINE:',
      'EOF:',
    ]);
    expect(cut(V + 'set set-x').slice(2)).toEqual(['SET:set', 'SET:set', 'LEXICAL_ERROR:-']);
    expect(cut(V + 'set text-b').slice(2)).toEqual(['SET:set', 'TEXT:text', 'LEXICAL_ERROR:-']);
    expect(jison(V + 'set settings').slice(3, 4)).toEqual(['IDENTIFIER:settings']);
    expect(jison(V + 'set a-text').slice(3, 4)).toEqual(['IDENTIFIER:a-text']);
    expect(jison(V + 'set venn-betas').slice(3, 4)).toEqual(['IDENTIFIER:venn-betas']);
    // `title` and `rgb(…)` come before IDENTIFIER.
    expect(jison(V + 'set rgb(1,2,3)').slice(3, 4)).toEqual(['RGBCOLOR:rgb(1,2,3)']);
  });

  it('rejects non-ASCII ids but not strings, quotes kept', () => {
    expect(cut(V + 'set Ä').slice(2)).toEqual(['SET:set', 'LEXICAL_ERROR:Ä']);
    expect(jison(V + 'set "Ä"\nset ""').filter((t) => t.startsWith('STRING'))).toEqual([
      'STRING:"Ä"',
      'STRING:""',
    ]);
  });

  it('lexes sizes as v12 does: signs and a bare fraction, no exponent, no trailing dot', () => {
    expect(
      of(V + 'set A:01\nset B:0\nset C:-1\nset D:.5\nset E:+2\nset F:-.5', T.Numeric).map(
        (t) => t.text
      )
    ).toEqual(['01', '0', '-1', '.5', '+2', '-.5']);
    expect(cut(V + 'set A:1.').slice(-2)).toEqual(['NUMERIC:1', 'LEXICAL_ERROR:.']);
    expect(jison(V + 'set A:1e3').slice(4, 7)).toEqual(['COLON::', 'NUMERIC:1', 'IDENTIFIER:e3']);
    expect(jison(V + 'set A:3:4').slice(4, 8)).toEqual([
      'COLON::',
      'NUMERIC:3',
      'COLON::',
      'NUMERIC:4',
    ]);
    expect(cut(V + 'set A:+').slice(-1)).toEqual(['LEXICAL_ERROR:+']);
  });

  it('reads `[…]` trimmed and `["…"]` as it is, both across line breaks', () => {
    const src = V + 'set A[  spaced  ]\nset B[" q "]\nset C[""]\nset D[a\nb]\nset E["c\nd"]';
    expect(slices(src, T.Label)).toEqual([
      ['spaced', '[  spaced  ]'],
      ['a\nb', '[a\nb]'],
    ]);
    expect(slices(src, T.QuotedLabel)).toEqual([
      [' q ', '[" q "]'],
      ['', '[""]'],
      ['c\nd', '["c\nd"]'],
    ]);
    expect(jison(V + 'set A[   ]').slice(4, 5)).toEqual(['BRACKET_LABEL:']);
    // `[]`, a quote in a `[…]` label and a `["…"]` not closed by `]` match no rule.
    expect(cut(V + 'set A[]').slice(-1)).toEqual(['LEXICAL_ERROR:[']);
    expect(cut(V + 'set A[a"b]').slice(-1)).toEqual(['LEXICAL_ERROR:[']);
    expect(cut(V + 'set A["x"y"]').slice(-1)).toEqual(['LEXICAL_ERROR:[']);
  });

  it('turns indent mode on at `set` and `union`, through blank and comment lines', () => {
    const src = V + 'set A\n  text a1\n\n   \n  %% c\n  text a2\nunion A,A\n\tTEXT a3';
    expect(jison(src).filter((t) => /^(INDENT_TEXT|TEXT|IDENTIFIER:a)/.test(t))).toEqual([
      'INDENT_TEXT:  ',
      'IDENTIFIER:a1',
      'INDENT_TEXT:  ',
      'IDENTIFIER:a2',
      'INDENT_TEXT:\t',
      'IDENTIFIER:a3',
    ]);
    // The `text` after INDENT_TEXT is a token with no jison name.
    expect(slices(src, T.IndentTextKeyword)).toEqual([
      ['text', 'text'],
      ['text', 'text'],
      ['TEXT', 'TEXT'],
    ]);
    // Indentation depth is never compared; a line glued to a comment does not end the mode.
    expect(of(V + 'set A\n        text a\n text b\nx%% c\n  text c', T.IndentText)).toHaveLength(3);
  });

  it('turns indent mode off at any other line start, and keeps it off before any set', () => {
    const indented = (src: string) => of(src, T.IndentText).length;
    expect(indented(V + '  text a')).toBe(0);
    expect(indented(V + 'set A\ntitle T\n  text a')).toBe(0);
    expect(indented(V + 'set A\nstyle A fill:red\n  text a')).toBe(0);
    // Indented, too: the blanks are skipped, then the `style` turns the mode off.
    expect(indented(V + 'set A\n  style A fill:red\n  text a')).toBe(0);
    expect(indented(V + 'set A\ntext A x\n  text y')).toBe(0);
    // An indented `%%{-}` (no directive, and no comment line v12 removed) is a `%` after the
    // blanks: the mode goes off, then the rest of the line is a skipped comment.
    expect(indented(V + 'set A\n  %%{-}\n  text a')).toBe(0);
    expect(jison(V + 'set A\n  %%{-}\n  text a').slice(5, 8)).toEqual([
      'NEWLINE:\n',
      'TEXT:text',
      'IDENTIFIER:a',
    ]);
  });

  it('needs `text` then `\\b` after the blanks', () => {
    expect(jison(V + 'set A\n  textual').slice(5, 6)).toEqual(['IDENTIFIER:textual']);
    expect(cut(V + 'set A\n  text-x y').slice(5)).toEqual(['INDENT_TEXT:  ', 'LEXICAL_ERROR:-']);
  });

  it('keeps a title as written, `title\\s` taking a line break too', () => {
    expect(of(V + 'title  Hello  \nset A', T.Title).map((t) => t.text)).toEqual(['title  Hello  ']);
    expect(of(V + 'title "Team overlap"', T.Title).map((t) => t.text)).toEqual([
      'title "Team overlap"',
    ]);
    expect(jison(V + 'title\nset A')).toEqual([
      'VENN:venn-beta',
      'NEWLINE:\n',
      'TITLE:title\nset A',
      'NEWLINE:',
      'EOF:',
    ]);
    expect(jison(V + 'title').slice(2, 3)).toEqual(['IDENTIFIER:title']);
    expect(cut(V + 'title a;b').slice(-2)).toEqual(['TITLE:title a', 'LEXICAL_ERROR:;']);
    expect(cut(V + 'title a#b').slice(-2)).toEqual(['TITLE:title a', 'LEXICAL_ERROR:#']);
    // A comment and an entity are title text.
    expect(of(V + 'title x %% c', T.Title)[0]?.text).toBe('title x %% c');
    expect(of(V + 'title a #35; b', T.Title)[0]?.text).toBe('title a &#35; b');
  });

  it('eats the character before a glued `%%`, a line break too', () => {
    expect(jison(V + 'set A%% c')).toEqual([
      'VENN:venn-beta',
      'NEWLINE:\n',
      'SET:set',
      'NEWLINE:',
      'EOF:',
    ]);
    const glued = stream(V + 'set A%% c').find((t) => t.kind === Kind.Comment);
    expect(glued && (V + 'set A%% c').slice(glued.start, glued.end)).toBe('A%% c');
    expect(jison(V + 'set AB%% c').slice(3, 4)).toEqual(['IDENTIFIER:AB']);
    expect(jison(V + 'set A:2%% c').slice(4, 6)).toEqual(['COLON::', 'NEWLINE:']);
    expect(cut(V + 'set A}%% c').slice(-1)).toEqual(['LEXICAL_ERROR:}']);
    // A bare `%%` line (v12's comment removal wants a character after it): the line break
    // before it goes with it.
    expect(jison(V + 'set A\n%%\nset B').slice(4, 6)).toEqual(['NEWLINE:\n', 'SET:set']);
    expect(of(V + 'set A\n%%\nset B', Kind.Newline)).toHaveLength(3);
    // At a token start, a `[` before `%%` goes too.
    expect(jison(V + 'set A[%% x]\nset B').slice(3, 5)).toEqual(['IDENTIFIER:A', 'NEWLINE:\n']);
  });

  it('lexes style values: hex of three to eight digits, rgb and rgba across lines', () => {
    const src = V + 'style A fill:#123456789, stroke:rgba( 1 ,2,3,\n0.5 ), color:RGB(1,2,3)';
    expect(jison(src).filter((t) => /COLOR|NUMERIC/.test(t))).toEqual([
      'HEXCOLOR:#12345678',
      'NUMERIC:9',
      'RGBACOLOR:rgba( 1 ,2,3,\n0.5 )',
      'RGBCOLOR:RGB(1,2,3)',
    ]);
    expect(cut(V + 'style A fill:#12').slice(-1)).toEqual(['LEXICAL_ERROR:#']);
    expect(cut(V + 'style A fill:rgb(1,2)').slice(-2)).toEqual([
      'IDENTIFIER:rgb',
      'LEXICAL_ERROR:(',
    ]);
    expect(jison(V + 'style A font-size: 12px').slice(6, 8)).toEqual([
      'NUMERIC:12',
      'IDENTIFIER:px',
    ]);
  });

  it('reads an entity as v12 read its placeholder: text in labels, an error elsewhere', () => {
    expect(of(V + 'set A[a #35; b]', T.Label)[0]?.text).toBe('a &#35; b');
    expect(of(V + 'set "a#9829;b"', T.String)[0]?.text).toBe('"a&#9829;b"');
    expect(cut(V + 'set A\ntext A x #35;').slice(-1)).toEqual(['LEXICAL_ERROR:#']);
    // `#abc;` would be a hex colour without v12's placeholder (in a `style` line v12 drops
    // the last `;` first, so there it is one).
    expect(of(V + 'text A #abc;', T.HexColor)).toEqual([]);
    expect(of(V + 'style A fill:#abc;', T.HexColor).map((t) => t.text)).toEqual(['#abc']);
  });

  it("reads a `\"` v12 turned into `'` in a tag as `'`", () => {
    expect(slices(V + 'set A[<b class="x">a</b>]', T.Label)).toEqual([
      ["<b class='x'>a</b>", '[<b class="x">a</b>]'],
    ]);
  });

  it('rejects `;`, line separators outside text, and other blanks', () => {
    expect(cut(V + 'set A;').slice(-1)).toEqual(['LEXICAL_ERROR:;']);
    expect(cut('venn-beta set A')).toEqual(['VENN:venn-beta', 'LEXICAL_ERROR: ']);
    expect(cut(V + 'set A\fB').slice(-1)).toEqual(['LEXICAL_ERROR:\f']);
    expect(cut(V + 'set A B').slice(-1)).toEqual(['LEXICAL_ERROR: ']);
  });
});

describe('venn lexer output', () => {
  it('lexes one token across removed spans (pitfall 4)', () => {
    const src = V + 'set A%%{init: {}}%%B\nset C[a\n%% c\nb]';
    expect(slices(src, T.Identifier)).toEqual([
      ['AB', 'A%%{init: {}}%%B'],
      ['C', 'C'],
    ]);
    expect(slices(src, T.Label)).toEqual([['a\nb', '[a\n%% c\nb]']]);
    // The removed spans are trivia tokens of their own, in source order.
    const kinds = stream(src).map((t) => t.kind);
    expect(kinds.filter((k) => k === Kind.Directive || k === Kind.Comment)).toEqual([
      Kind.Directive,
      Kind.Comment,
    ]);
    const starts = stream(src).map((t) => t.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('maps CRLF and CR line breaks to their source ranges', () => {
    const src = 'venn-beta\r\nset A\r  text a\r\n';
    expect(slices(src, Kind.Newline)).toEqual([
      ['\n', '\r\n'],
      ['\n', '\r'],
      ['\n', '\r\n'],
    ]);
    expect(of(src, T.IndentText)).toHaveLength(1);
  });

  it('gives the `;` v12 dropped from a style line to the token before it', () => {
    const src = V + 'set A\nstyle A fill:#f00;';
    expect(slices(src, T.HexColor)).toEqual([['#f00', '#f00;']]);
  });

  it('writes one error per code point and lexes on in the same state', () => {
    const src = V + 'set A @😀 B';
    expect(slices(src, Kind.Error)).toEqual([
      ['@', '@'],
      ['😀', '😀'],
    ]);
    expect(of(src, T.Identifier).map((t) => t.text)).toEqual(['A', 'B']);
  });

  it('ends with a zero-width EOF at the end of the source', () => {
    const src = V + 'set A\n';
    const eof = of(src, T.Eof);
    expect(eof.map((t) => t.range)).toEqual([{ start: src.length, end: src.length }]);
    expect(stream(src).at(-1)).toEqual({ kind: Kind.EOF, start: src.length, end: src.length });
  });

  it('skips blanks between tokens: no token covers them', () => {
    const src = V + 'set  \t A';
    expect(stream(src).filter((t) => t.kind === Kind.Space)).toEqual([]);
    expect(slices(src, T.Identifier)).toEqual([['A', 'A']]);
  });
});
