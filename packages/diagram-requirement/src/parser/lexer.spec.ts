import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { JISON_NAMES, requirementTokens, requirementView } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

const stream = (src: string) => {
  const { from, view } = requirementView(src);
  const s = lex(src, from, view).tokens;
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => requirementTokens(src).filter((t) => t.kind === kind);
/** Each token of `kind`: its text and its source slice. */
const slices = (src: string, kind: number) =>
  of(src, kind).map((t) => [t.text, src.slice(t.range.start, t.range.end)]);
/** jison terminal and text of each token with one, as the parity gate sees them. */
const jison = (src: string) =>
  requirementTokens(src).flatMap((t) => {
    const name = JISON_NAMES[t.kind];
    return name ? [`${name}:${t.text}`] : [];
  });
/** The jison stream up to and including the first lexical error, as the gate cuts it. */
const cut = (src: string) => {
  const all = jison(src);
  const e = all.findIndex((t) => t.startsWith('LEXICAL_ERROR'));
  return e < 0 ? all : all.slice(0, e + 1);
};
const H = 'requirementDiagram\n';
const HEAD = ['RD:requirementDiagram', 'NEWLINE:\n'];

// The expected streams below are v12's (the jison lexer oracle) for the quirks spec #520
// lists, with D431 and D432 applied where noted.
describe('requirementDiagram.jison quirks', () => {
  it('lexes a bare header as RD NEWLINE EOF, the header word-bounded', () => {
    expect(jison('requirementDiagram')).toEqual(['RD:requirementDiagram', 'NEWLINE:', 'EOF:']);
    expect(jison(H)).toEqual([...HEAD, 'EOF:']);
    expect(jison('requirement\n')).toEqual(['REQUIREMENT:requirement', 'NEWLINE:\n', 'EOF:']);
    expect(jison('requirementDiagramx\n').slice(0, 1)).toEqual(['unqString:requirementDiagramx']);
    // v12 trims the blanks and line breaks before the header.
    expect(jison('\n\n  requirementDiagram\n\n\nx').slice(0, 2)).toEqual([
      'RD:requirementDiagram',
      'NEWLINE:\n\n\n',
    ]);
  });

  it('reads keywords case-insensitively and word-bounded, then names as unquoted strings', () => {
    expect(jison(H + 'REQUIREMENT A {\nRISK: HIGH\n}')).toEqual([
      ...HEAD,
      'REQUIREMENT:REQUIREMENT',
      'unqString:A',
      'STRUCT_START:{',
      'NEWLINE:\n',
      'RISK:RISK',
      'COLONSEP::',
      'HIGH_RISK:HIGH',
      'NEWLINE:\n',
      'STRUCT_STOP:}',
      'NEWLINE:',
      'EOF:',
    ]);
    // `element test {` is a VERIFY_TEST; `test_req` and `textbox` are names.
    expect(jison(H + 'element test {').slice(2, 4)).toEqual([
      'ELEMENT:element',
      'VERIFY_TEST:test',
    ]);
    expect(jison(H + 'element test_req {').slice(3, 4)).toEqual(['unqString:test_req']);
    expect(jison(H + 'text: textbox').slice(2)).toEqual([
      'TEXT:text',
      'COLONSEP::',
      'unqString:textbox',
      'NEWLINE:',
      'EOF:',
    ]);
    expect(jison(H + 'text: high quality').slice(4, 6)).toEqual([
      'HIGH_RISK:high',
      'unqString:quality',
    ]);
    expect(cut(H + 'element test.x {').slice(-2)).toEqual(['VERIFY_TEST:test', 'LEXICAL_ERROR:.']);
    expect(jison(H + 'requirementx a {').slice(2, 3)).toEqual(['unqString:requirementx a']);
    expect(jison(H + 'classDefault x').slice(2, 3)).toEqual(['unqString:classDefault x']);
  });

  it('lexes `title …` (which no grammar rule takes), a line break after `title` too', () => {
    expect(jison(H + 'title x').slice(2)).toEqual(['title:title x', 'NEWLINE:', 'EOF:']);
    expect(jison(H + 'title\nx').slice(2)).toEqual(['title:title\nx', 'NEWLINE:', 'EOF:']);
    expect(cut(H + 'title x;y').slice(2)).toEqual(['title:title x', 'LEXICAL_ERROR:;']);
    expect(jison(H + 'title x # y').slice(2, 3)).toEqual(['title:title x ']);
  });

  it('skips `#` and `%` comments at a token start only', () => {
    expect(jison(H + '% c\n# d\nx')).toEqual([
      ...HEAD,
      'NEWLINE:\n',
      'NEWLINE:\n',
      'unqString:x',
      'NEWLINE:',
      'EOF:',
    ]);
    expect(jison(H + 'text: issue #42 here').slice(4, 5)).toEqual(['unqString:issue #42 here']);
    expect(jison(H + 'a - traces -> b %% c').slice(-3, -2)).toEqual(['unqString:b %% c']);
    expect(jison(H + 'a { # c\n}').slice(2)).toEqual([
      'unqString:a',
      'STRUCT_START:{',
      'NEWLINE:\n',
      'STRUCT_STOP:}',
      'NEWLINE:',
      'EOF:',
    ]);
  });

  it('stops unquoted strings at `: , - = < > {` and a line break, trimmed; `\\w` first', () => {
    expect(cut(H + 'a:b,c-d<e>f=g{h').slice(2)).toEqual([
      'unqString:a',
      'COLONSEP::',
      'unqString:b',
      'COMMA:,',
      'unqString:c',
      'LINE:-',
      'unqString:d',
      'LEXICAL_ERROR:<',
    ]);
    expect(slices(H + 'requirement a   {', T.UnqString)).toEqual([['a', 'a']]);
    expect(cut(H + 'element Ärende {').slice(-1)).toEqual(['LEXICAL_ERROR:Ä']);
    expect(of(H + 'element aÄrende {', T.UnqString).map((t) => t.text)).toEqual(['aÄrende']);
    expect(jison(H + 'a <- copies - b').slice(2, 7)).toEqual([
      'unqString:a',
      'END_ARROW_L:<-',
      'COPIES:copies',
      'LINE:-',
      'unqString:b',
    ]);
  });

  it('reads quoted strings across lines, with no escapes; `""` gives no qString', () => {
    expect(jison(H + 'requirement "a\nb" {').slice(3, 4)).toEqual(['qString:a\nb']);
    expect(slices(H + 'requirement "a\nb" {', T.QString)).toEqual([['a\nb', 'a\nb']]);
    expect(of(H + 'requirement "a\nb" {', T.Quote)).toHaveLength(2);
    expect(jison(H + 'requirement "" {').slice(2, 4)).toEqual([
      'REQUIREMENT:requirement',
      'STRUCT_START:{',
    ]);
    // A text that ends inside quotes ends with an empty qString, and no EOF.
    expect(jison(H + 'requirement "abc').slice(3)).toEqual(['qString:abc', 'qString:']);
  });

  it('ends acc values at a line break and blocks at `}`, with empty values at the end', () => {
    expect(jison(H + 'accTitle: t  \naccDescr {\n  d\n}\n')).toEqual([
      ...HEAD,
      'acc_title:accTitle: ',
      'acc_title_value:t  ',
      'NEWLINE:\n',
      'acc_descr_multiline_value:d\n',
      'NEWLINE:\n',
      'EOF:',
    ]);
    expect(jison(H + 'accTitle:').slice(2)).toEqual(['acc_title:accTitle:', 'acc_title_value:']);
    expect(jison(H + 'accDescr {\nfoo').slice(2)).toEqual([
      'acc_descr_multiline_value:foo',
      'acc_descr_multiline_value:',
    ]);
    expect(of(H + 'accDescr {}\n', T.AccDescrOpen)).toHaveLength(1);
    expect(of(H + 'accDescr {}\n', T.AccDescrClose)).toHaveLength(1);
  });

  it('drops spaces in styles, ends them at a line break with no NEWLINE', () => {
    expect(jison(H + 'style a stroke-dasharray: 5 5;')).toEqual([
      ...HEAD,
      'STYLE:style',
      'ALPHA:a',
      'ALPHA:stroke',
      'MINUS:-',
      'ALPHA:dasharray',
      'COLON::',
      'ALPHA:5',
      'ALPHA:5',
      'SEMICOLON:;',
      'EOF:',
    ]);
    expect(jison(H + 'style a fill:50%').slice(-2)).toEqual(['PERCENT:%', 'EOF:']);
    expect(cut(H + 'style a fill:a.b').slice(-1)).toEqual(['LEXICAL_ERROR:.']);
    expect(cut(H + 'style a fill:\tred').slice(-1)).toEqual(['LEXICAL_ERROR:\t']);
    expect(jison(H + 'style "a b" fill:red').slice(3, 4)).toEqual(['qString:a b']);
    expect(jison(H + 'style a,b fill:red\n  \nrequirement b {').slice(2)).toEqual([
      'STYLE:style',
      'ALPHA:a',
      'COMMA:,',
      'ALPHA:b',
      'ALPHA:fill',
      'COLON::',
      'ALPHA:red',
      'REQUIREMENT:requirement',
      'unqString:b',
      'STRUCT_START:{',
      'NEWLINE:',
      'EOF:',
    ]);
    expect(of(H + 'style a fill:red\nx', T.StyleEnd)).toHaveLength(1);
  });

  it('drops the `;` v12 dropped from a style line, and reads entities as v12 did', () => {
    expect(jison(H + 'style a fill:#f00;').slice(-3)).toEqual(['BRKT:#', 'ALPHA:f00', 'EOF:']);
    expect(cut(H + 'style a fill:#f00;stroke:#00f;').slice(-1)).toEqual(['LEXICAL_ERROR:#']);
    expect(of(H + 'text: a #amp; b', T.UnqString)[0]?.text).toBe('a &amp; b');
    expect(of(H + 'requirement "a #9829; b"', T.QString)[0]?.text).toBe('a &#9829; b');
    expect(slices(H + 'text: "<b class="x">t</b>"', T.QString)).toEqual([
      ["<b class='x'>t</b>", '<b class="x">t</b>'],
    ]);
  });
});

describe('D432: `direction` only as a statement at a line start', () => {
  it('reads `direction`, blanks and a direction at a line start, then `\\b`', () => {
    expect(jison(H + '  direction LR\ndirection\tbt # c\n').slice(2)).toEqual([
      'direction_lr:direction LR',
      'NEWLINE:\n',
      'direction_bt:direction\tbt',
      'NEWLINE:\n',
      'EOF:',
    ]);
    expect(jison(H + 'style a fill:red\ndirection LR').slice(-3, -2)).toEqual([
      'direction_lr:direction LR',
    ]);
    // No `\b`, or a line break before the direction: not a direction (v12 read both as one).
    expect(jison(H + 'direction TBX').slice(2, 3)).toEqual(['unqString:direction TBX']);
    expect(jison(H + 'direction\nTB').slice(2, 5)).toEqual([
      'unqString:direction',
      'NEWLINE:\n',
      'unqString:TB',
    ]);
  });

  it('lexes the rest of the line as usual (v12 took it into the token)', () => {
    expect(jison(H + 'direction LR a - traces -> b').slice(2)).toEqual([
      'direction_lr:direction LR',
      'unqString:a',
      'LINE:-',
      'TRACES:traces',
      'END_ARROW_R:->',
      'unqString:b',
      'NEWLINE:',
      'EOF:',
    ]);
    // v12's rules in order over the line made this a TB.
    expect(jison(H + 'direction BT x direction TB').slice(2, 4)).toEqual([
      'direction_bt:direction BT',
      'unqString:x direction TB',
    ]);
    expect(cut(H + 'direction LR;').slice(2)).toEqual([
      'direction_lr:direction LR',
      'LEXICAL_ERROR:;',
    ]);
  });

  it('lexes other lines as usual (v12 made them direction tokens)', () => {
    expect(jison(H + 'a - traces -> b direction LR').slice(2)).toEqual([
      'unqString:a',
      'LINE:-',
      'TRACES:traces',
      'END_ARROW_R:->',
      'unqString:b direction LR',
      'NEWLINE:',
      'EOF:',
    ]);
    expect(jison(H + 'text: go direction LR now').slice(4, 5)).toEqual([
      'unqString:go direction LR now',
    ]);
    expect(jison(H + 'foo direction LR').slice(2, 3)).toEqual(['unqString:foo direction LR']);
    expect(jison(H + 'title direction LR').slice(2, 3)).toEqual(['title:title direction LR']);
  });
});

describe('D431: blanks before a line break are dropped', () => {
  it('keeps the line break after a blank that follows other text, as its own kind', () => {
    expect(jison('requirementDiagram \nrequirement a { \n  risk: high\t\n}  ')).toEqual([
      'RD:requirementDiagram',
      'NEWLINE:\n',
      'REQUIREMENT:requirement',
      'unqString:a',
      'STRUCT_START:{',
      'NEWLINE:\n',
      'RISK:risk',
      'COLONSEP::',
      'HIGH_RISK:high',
      'NEWLINE:\n',
      'STRUCT_STOP:}',
      'NEWLINE:',
      'EOF:',
    ]);
    const src = H + 'requirement "a" \n{\n}';
    expect(slices(src, T.NewlineAfterBlank)).toEqual([['\n', '\n']]);
    expect(of(src, Kind.Newline)).toHaveLength(3);
  });

  it('skips a blank run at a line start whole, as v12 did', () => {
    expect(jison(H + 'a {\n  \n\t\n  id: 1').slice(2, 6)).toEqual([
      'unqString:a',
      'STRUCT_START:{',
      'NEWLINE:\n',
      'ID:id',
    ]);
    // An unquoted string takes its trailing blanks, so its line break was never swallowed.
    expect(of(H + 'a - traces -> b  \nc', T.NewlineAfterBlank)).toEqual([]);
  });
});

describe('requirement lexer output', () => {
  it('lexes one token across removed spans (pitfall 4)', () => {
    const src = H + 'requirement a%%{init: {}}%%b {\n  text: "x\n%% c\ny"\n}';
    expect(slices(src, T.UnqString)).toEqual([['ab', 'a%%{init: {}}%%b']]);
    expect(slices(src, T.QString)).toEqual([['x\ny', 'x\n%% c\ny']]);
    const kinds = stream(src).map((t) => t.kind);
    expect(kinds.filter((k) => k === Kind.Directive || k === Kind.Comment)).toEqual([
      Kind.Directive,
      Kind.Comment,
    ]);
    const starts = stream(src).map((t) => t.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('maps CRLF and CR line breaks to their source ranges', () => {
    const src = 'requirementDiagram\r\nrequirement a {\r}\r\n';
    expect(slices(src, Kind.Newline)).toEqual([
      ['\n', '\r\n'],
      ['\n', '\r'],
      ['\n', '\r\n'],
    ]);
  });

  it('gives the `;` v12 dropped from a style line to the token before it', () => {
    const src = H + 'style a fill:#f00;';
    expect(slices(src, T.Alpha).at(-1)).toEqual(['f00', 'f00;']);
  });

  it('writes one error per code point and lexes on in the same state', () => {
    const src = H + 'style a @😀 b';
    expect(slices(src, Kind.Error)).toEqual([
      ['@', '@'],
      ['😀', '😀'],
    ]);
    expect(of(src, T.Alpha).map((t) => t.text)).toEqual(['a', 'b']);
  });

  it('ends with a zero-width EOF at the end of the source', () => {
    const src = H + 'requirement a {\n}\n';
    expect(of(src, T.Eof).map((t) => t.range)).toEqual([{ start: src.length, end: src.length }]);
    expect(stream(src).at(-1)).toEqual({ kind: Kind.EOF, start: src.length, end: src.length });
  });

  it('skips blanks between tokens and keeps comments as trivia', () => {
    const src = H + 'requirement  \t a { # c';
    expect(stream(src).filter((t) => t.kind === Kind.Space)).toEqual([]);
    expect(slices(src, T.UnqString)).toEqual([['a', 'a']]);
    expect(stream(src).filter((t) => t.kind === Kind.Comment)).toHaveLength(1);
  });
});
