import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { JISON_NAMES, sankeyTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

const stream = (src: string) => {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const lexed = lex(src, pre.bodyStart, view);
  const s = lexed.tokens;
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
    text: lexed.text(j),
  }));
};
/** Each token's text and the source its range covers. */
const slices = (src: string, kind?: number) =>
  sankeyTokens(src)
    .filter((t) => kind === undefined || t.kind === kind)
    .map((t) => [t.text, src.slice(t.range.start, t.range.end)]);
/** jison terminal and text of each token, as the parity gate sees them. */
const jison = (src: string) =>
  sankeyTokens(src).map((t) => `${JISON_NAMES[t.kind] ?? t.kind}:${t.text}`);

// The expected streams below are v12's (the jison lexer oracle), for the quirks spec #427
// lists; a stall (an endless run of empty text tokens in v12) is a `LEXICAL_ERROR` here.
describe('sankey.jison quirks', () => {
  it('reads the header case-insensitively, word-bounded, `sankey-beta` first', () => {
    expect(jison('sankey-Beta\na,b,1').slice(0, 2)).toEqual(['SANKEY:sankey-Beta', 'NEWLINE:\n']);
    expect(jison('sankey-betax\na').slice(0, 2)).toEqual([
      'SANKEY:sankey',
      'NON_ESCAPED_TEXT:-betax',
    ]);
    expect(jison('sankeyx\nSANKEY\na').slice(0, 3)).toEqual([
      'NON_ESCAPED_TEXT:sankeyx',
      'NEWLINE:\n',
      'SANKEY:SANKEY',
    ]);
    expect(jison('sankey_beta')).toEqual(['NON_ESCAPED_TEXT:sankey_beta', 'EOF:']);
  });

  it('reads the keyword as text after the header, quoted or not', () => {
    expect(jison('sankey\nsankey,sankey-beta,1')).toEqual([
      'SANKEY:sankey',
      'NEWLINE:\n',
      'NON_ESCAPED_TEXT:sankey',
      'COMMA:,',
      'NON_ESCAPED_TEXT:sankey-beta',
      'COMMA:,',
      'NON_ESCAPED_TEXT:1',
      'EOF:',
    ]);
  });

  it('keeps blanks after the header and around fields in the text', () => {
    expect(jison('sankey  \na')).toEqual([
      'SANKEY:sankey',
      'NON_ESCAPED_TEXT:  ',
      'NEWLINE:\n',
      'NON_ESCAPED_TEXT:a',
      'EOF:',
    ]);
    expect(jison('sankey\n  a , b , 1  ').slice(2)).toEqual([
      'NON_ESCAPED_TEXT:  a ',
      'COMMA:,',
      'NON_ESCAPED_TEXT: b ',
      'COMMA:,',
      'NON_ESCAPED_TEXT: 1',
      'EOF:',
    ]);
  });

  it('reads quoted fields: commas, line breaks and doubled quotes inside', () => {
    expect(jison('sankey\n"a,1","b ""q""",3').slice(2, 9)).toEqual([
      'DQUOTE:"',
      'ESCAPED_TEXT:a,1',
      'DQUOTE:"',
      'COMMA:,',
      'DQUOTE:"',
      'ESCAPED_TEXT:b ""q""',
      'DQUOTE:"',
    ]);
    expect(jison('sankey\n"",b').slice(2, 5)).toEqual(['DQUOTE:"', 'DQUOTE:"', 'COMMA:,']);
    expect(jison('sankey\n"a\n\nb",c').slice(3, 4)).toEqual(['ESCAPED_TEXT:a\nb']);
  });

  it('ends the text inside quotes with one empty ESCAPED_TEXT and no EOF', () => {
    expect(jison('sankey\n"abc,b,1')).toEqual([
      'SANKEY:sankey',
      'NEWLINE:\n',
      'DQUOTE:"',
      'ESCAPED_TEXT:abc,b,1',
      'ESCAPED_TEXT:',
    ]);
    const end = sankeyTokens('sankey\na,"').at(-1);
    expect(end).toMatchObject({ kind: T.EscapedText, text: '', range: { start: 10, end: 10 } });
  });

  it('reads a quote after text, or text after a closing quote, as tokens of their own', () => {
    expect(jison('sankey\na"b,c').slice(2)).toEqual([
      'NON_ESCAPED_TEXT:a',
      'DQUOTE:"',
      'ESCAPED_TEXT:b,c',
      'ESCAPED_TEXT:',
    ]);
    expect(jison('sankey\n"a"x,b').slice(4, 6)).toEqual(['DQUOTE:"', 'NON_ESCAPED_TEXT:x']);
  });

  it('stops on a character outside printable ASCII, quoted or not: one error per run', () => {
    expect(slices('sankey\nZürich,b,1')).toEqual([
      ['sankey', 'sankey'],
      ['\n', '\n'],
      ['Z', 'Z'],
      ['ü', 'ü'],
      ['rich', 'rich'],
      [',', ','],
      ['b', 'b'],
      [',', ','],
      ['1', '1'],
      ['', ''],
    ]);
    expect(slices('sankey\n"a\té\u{1f600}b",c', Kind.Error)).toEqual([
      ['\té\u{1f600}', '\té\u{1f600}'],
    ]);
    expect(slices('sankey\na b,c', Kind.Error)).toEqual([[' ', ' ']]);
  });

  it('stops on an entity, which v12 encoded into non-ASCII placeholders', () => {
    expect(slices('sankey\na#9829;b,c,1', Kind.Error)).toEqual([['#9829;', '#9829;']]);
    expect(slices('sankey\n"#amp;",c,1', Kind.Error)).toEqual([['#amp;', '#amp;']]);
    // Not entities: `#` without a word and `;`.
    expect(jison('sankey\na#b,#;,# x;').slice(2, 7)).toEqual([
      'NON_ESCAPED_TEXT:a#b',
      'COMMA:,',
      'NON_ESCAPED_TEXT:#;',
      'COMMA:,',
      'NON_ESCAPED_TEXT:# x;',
    ]);
  });

  it('reads tag attribute quotes and style semicolons as v12 rewrote them', () => {
    expect(jison('sankey\n<b c="x">,d,2')[2]).toBe("NON_ESCAPED_TEXT:<b c='x'>");
    // The `;` that encodeEntities dropped is covered by the token before it.
    expect(slices('sankey\nstyle a:#f;,b,1')[2]).toEqual(['style a:#f', 'style a:#f;']);
    expect(slices('sankey\nclassDef a:#f;b,c,1')[2]).toEqual(['classDef a:#fb', 'classDef a:#f;b']);
  });

  it('collapses line-break runs into one NEWLINE whose range covers the run', () => {
    expect(slices('sankey\n\n\na,b,1\r\n\r\nc', Kind.Newline)).toEqual([
      ['\n', '\n\n\n'],
      ['\n', '\r\n\r\n'],
    ]);
    // A line of blanks is no blank line to v12.
    expect(jison('sankey\na\n   \nc').slice(2)).toEqual([
      'NON_ESCAPED_TEXT:a',
      'NEWLINE:\n',
      'NON_ESCAPED_TEXT:   ',
      'NEWLINE:\n',
      'NON_ESCAPED_TEXT:c',
      'EOF:',
    ]);
  });

  it('trims blanks and line breaks off both ends of the text', () => {
    expect(jison(' \n  sankey\na,b,1 \n\n   ')).toEqual([
      'SANKEY:sankey',
      'NEWLINE:\n',
      'NON_ESCAPED_TEXT:a',
      'COMMA:,',
      'NON_ESCAPED_TEXT:b',
      'COMMA:,',
      'NON_ESCAPED_TEXT:1',
      'EOF:',
    ]);
    // EOF sits just past the last character v12 kept.
    const src = 'sankey\na,b,1  \n\n';
    expect(sankeyTokens(src).at(-1)?.range).toEqual({ start: 12, end: 12 });
  });

  it('reads `%%` in a field, or a bare `%%` line, as text', () => {
    expect(jison('sankey\na,b %% c,1 %% d').slice(4, 7)).toEqual([
      'NON_ESCAPED_TEXT:b %% c',
      'COMMA:,',
      'NON_ESCAPED_TEXT:1 %% d',
    ]);
    expect(jison('sankey\na,b,1\n%%\nc').slice(7, 9)).toEqual([
      'NEWLINE:\n',
      'NON_ESCAPED_TEXT:%%',
    ]);
  });
});

describe('the token stream', () => {
  it('writes one token across a removed comment or directive, whose range covers it', () => {
    const src = 'sankey\na%%{init: {}}%%b,"x\n%% c\ny",1';
    const all = stream(src);
    const text = all.find((t) => t.kind === T.Text);
    expect(text && [text.text, src.slice(text.start, text.end)]).toEqual([
      'ab',
      'a%%{init: {}}%%b',
    ]);
    const escaped = all.find((t) => t.kind === T.EscapedText);
    expect(escaped && [escaped.text, src.slice(escaped.start, escaped.end)]).toEqual([
      'x\ny',
      'x\n%% c\ny',
    ]);
    expect(all.filter((t) => t.kind === Kind.Directive || t.kind === Kind.Comment)).toEqual([
      { kind: Kind.Directive, start: 8, end: 22, text: '%%{init: {}}%%' },
      { kind: Kind.Comment, start: 27, end: 32, text: '%% c\n' },
    ]);
  });

  it('writes comment lines as trivia in source order, and ends in Kind.EOF', () => {
    const src = '%% a\nsankey\n%% b\na,b,1\n%% c';
    const kinds = stream(src).map((t) => t.kind);
    expect(kinds).toEqual([
      Kind.Comment,
      T.Sankey,
      Kind.Newline,
      Kind.Comment,
      T.Text,
      T.Comma,
      T.Text,
      T.Comma,
      T.Text,
      // The line break before the last comment is trailing blanks to v12: trimmed.
      T.Eof,
      Kind.Comment,
      Kind.EOF,
    ]);
  });

  it('maps ranges after front matter, CRLF and CR to the source', () => {
    const src = '---\ntitle: T\n---\r\nsankey\r\n"a\r\nb"\rc,d,1';
    expect(slices(src)).toEqual([
      ['sankey', 'sankey'],
      ['\n', '\r\n'],
      ['"', '"'],
      ['a\nb', 'a\r\nb'],
      ['"', '"'],
      ['\n', '\r'],
      ['c', 'c'],
      [',', ','],
      ['d', 'd'],
      [',', ','],
      ['1', '1'],
      ['', ''],
    ]);
  });

  it('lexes an empty source, or one with no header, without throwing', () => {
    expect(jison('')).toEqual(['EOF:']);
    expect(jison('  \n ')).toEqual(['EOF:']);
    expect(jison('a,b,1')).toEqual([
      'NON_ESCAPED_TEXT:a',
      'COMMA:,',
      'NON_ESCAPED_TEXT:b',
      'COMMA:,',
      'NON_ESCAPED_TEXT:1',
      'EOF:',
    ]);
  });
});
