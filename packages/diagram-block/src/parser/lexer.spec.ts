import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { bodyView } from '@mermaid-js/shared/parser/seen-tokens';
import { blockTokens, JISON_NAMES } from './index.ts';
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
const of = (src: string, kind: number) => blockTokens(src).filter((t) => t.kind === kind);
/** jison terminal and text of each token with one, as the parity gate sees them. */
const jison = (src: string) =>
  blockTokens(src).flatMap((t) => {
    const name = JISON_NAMES[t.kind];
    return name ? [`${name}:${t.text}`] : [];
  });
/** The jison stream up to and including the first lexical error, cut as the gate cuts it. */
const cut = (src: string) => {
  const all = jison(src);
  const e = all.findIndex((t) => t.startsWith('LEXICAL_ERROR:'));
  return e < 0 ? all : [...all.slice(0, e), 'LEXICAL_ERROR:'];
};
const B = 'block\n';
const HEAD = 'BLOCK_DIAGRAM_KEY:block';

// The expected streams below are v12's (the jison lexer oracle), for the quirks spec #521 lists.
describe('block.jison quirks', () => {
  it('lexes the header, ids and EOF, line breaks meaning nothing', () => {
    expect(jison('block-beta\n  a')).toEqual(['BLOCK_DIAGRAM_KEY:block-beta', 'NODE_ID:a', 'EOF:']);
    expect(jison(B + '  columns 2 a b c')).toEqual([
      HEAD,
      'COLUMNS:2',
      'NODE_ID:a',
      'NODE_ID:b',
      'NODE_ID:c',
      'EOF:',
    ]);
    expect(jison('block a')).toEqual([HEAD, 'NODE_ID:a', 'EOF:']);
  });

  it('bounds `block` and `block-beta` by `\\b`, but not `block:`', () => {
    expect(cut('block-betax\n  a')).toEqual([HEAD, 'LEXICAL_ERROR:']);
    expect(jison('blockchain\n  a')).toEqual(['NODE_ID:blockchain', 'NODE_ID:a', 'EOF:']);
    expect(jison(B + '  block:g\n  block BL')).toEqual([
      HEAD,
      'id-block:block:',
      'NODE_ID:g',
      HEAD,
      'NODE_ID:BL',
      'EOF:',
    ]);
  });

  it('reads wide ids: punctuation, Unicode, inline `%%`, `title`, `~~~`, `|x|`', () => {
    expect(jison(B + '  a; b, c. d| e& f% g# 日本 a"b"c')).toEqual([
      HEAD,
      ...['a;', 'b,', 'c.', 'd|', 'e&', 'f%', 'g#', '日本', 'a"b"c'].map((id) => `NODE_ID:${id}`),
      'EOF:',
    ]);
    expect(jison(B + '  a %% c')).toEqual([HEAD, 'NODE_ID:a', 'NODE_ID:%%', 'NODE_ID:c', 'EOF:']);
    expect(jison(B + '  title Hello')).toEqual([HEAD, 'NODE_ID:title', 'NODE_ID:Hello', 'EOF:']);
    expect(jison(B + '  a ~~~ b')).toEqual([HEAD, 'NODE_ID:a', 'NODE_ID:~~~', 'NODE_ID:b', 'EOF:']);
    expect(jison(B + '  x--x')).toEqual([HEAD, 'NODE_ID:x', 'LINK:--x', 'EOF:']);
    expect(jison(B + '  a -->|x| b')).toEqual([
      HEAD,
      'NODE_ID:a',
      'LINK:-->',
      'NODE_ID:|x|',
      'NODE_ID:b',
      'EOF:',
    ]);
  });

  it('wants quoted labels, which may span lines, with no blanks in the shape', () => {
    expect(jison(B + '  a["x\n  y"]')).toEqual([
      HEAD,
      'NODE_ID:a',
      'NODE_DSTART:[',
      'STR:x\n  y',
      'NODE_DEND:]',
      'EOF:',
    ]);
    expect(cut(B + '  a[x]')).toEqual([HEAD, 'NODE_ID:a', 'NODE_DSTART:[', 'LEXICAL_ERROR:']);
    expect(cut(B + '  a[ "x" ]')).toEqual([HEAD, 'NODE_ID:a', 'NODE_DSTART:[', 'LEXICAL_ERROR:']);
    expect(jison(B + '  a[""]')).toEqual([
      HEAD,
      'NODE_ID:a',
      'NODE_DSTART:[',
      'NODE_DEND:]',
      'EOF:',
    ]);
    expect(cut(B + '  a["x\\"y"]').slice(3)).toEqual(['STR:x\\', 'LEXICAL_ERROR:']);
    expect(jison(B + '  a["`md`"]').slice(3, 4)).toEqual(['MD_STR:md']);
    // An unterminated string ends in an empty STR, and no EOF.
    expect(jison(B + '  a["x').slice(3)).toEqual(['STR:x', 'STR:']);
  });

  it('tries the shape openers and closers in rule order', () => {
    expect(jison(B + '  a)))"x")))').slice(2)).toEqual([
      'NODE_DSTART:))',
      'NODE_DEND:)',
      'STR:x',
      'NODE_DSTART:))',
      'NODE_DEND:)',
      'EOF:',
    ]);
    expect(jison(B + '  a("x"]').slice(2)).toEqual([
      'NODE_DSTART:(',
      'STR:x',
      'NODE_DEND:]',
      'EOF:',
    ]);
    expect(jison(B + '  a>"x"]').slice(2, 3)).toEqual(['NODE_DSTART:>']);
    expect(jison(B + '  a[\\"x"\\] b[/"x"\\]').filter((t) => t.startsWith('NODE_D'))).toEqual([
      'NODE_DSTART:[\\',
      'NODE_DEND:\\]',
      'NODE_DSTART:[/',
      'NODE_DEND:\\]',
    ]);
  });

  it('reads `columns`: digits as written, `auto` as -1, the keyword case-sensitive', () => {
    expect(jison(B + '  columns 03 columns auto columns\n3').slice(1, 4)).toEqual([
      'COLUMNS:03',
      'COLUMNS:-1',
      'COLUMNS:3',
    ]);
    expect(jison(B + '  Columns 3 columns autox').slice(1, -1)).toEqual([
      'NODE_ID:Columns',
      'NODE_ID:3',
      'NODE_ID:columns',
      'NODE_ID:autox',
    ]);
    expect(cut(B + '  columns -1')).toEqual([HEAD, 'NODE_ID:columns', 'LEXICAL_ERROR:']);
  });

  it('reads spans and spaces as their digits', () => {
    expect(jison(B + '  a:2 b :0 space space:3 spaces').slice(1, -1)).toEqual([
      'NODE_ID:a',
      'SIZE:2',
      'NODE_ID:b',
      'SIZE:0',
      'SPACE_BLOCK:1',
      'SPACE_BLOCK:3',
      'NODE_ID:spaces',
    ]);
  });

  it('keeps blanks in arrow directions but a leading comma and its blanks', () => {
    expect(jison(B + '  a<["x"]>( right , left )').slice(2)).toEqual([
      'BLOCK_ARROW_START:<[',
      'STR:x',
      'DIR: right ',
      'DIR:left ',
      'BLOCK_ARROW_END:]>',
      'EOF:',
    ]);
    // No `\b` after a direction.
    expect(jison(B + '  a<["x"]>(rightx)').filter((t) => t.startsWith('DIR'))).toEqual([
      'DIR:right',
      'DIR:x',
    ]);
    expect(cut(B + '  a<["x"] >(up)').slice(-1)).toEqual(['LEXICAL_ERROR:']);
  });

  it('lexes edges with their trailing blanks, and labels as START_LINK LINK_LABEL STR LINK', () => {
    expect(
      jison(B + '  a --> b\n  a-.->b\n  a <==> b').filter((t) => t.startsWith('LINK'))
    ).toEqual(['LINK:--> ', 'LINK:-.->', 'LINK:<==> ']);
    expect(jison(B + '  a -- "l" -->\n  b').slice(2, -2)).toEqual([
      'START_LINK:-- ',
      'LINK_LABEL:"',
      'STR:l',
      'LINK: -->\n  ',
    ]);
    expect(cut(B + '  a -- b').slice(2)).toEqual(['START_LINK:-- ', 'LEXICAL_ERROR:']);
    expect(cut(B + '  a-->>b').slice(2)).toEqual(['LINK:-->', 'NODE_DSTART:>', 'LEXICAL_ERROR:']);
  });

  it('lexes classDef, class and style lines to the line end', () => {
    expect(jison(B + '  classDef c fill:#f00;\n  class a, b,c ,d e\n  style a').slice(1)).toEqual([
      'classDef:classDef ',
      'CLASSDEF_ID:c ',
      'CLASSDEF_STYLEOPTS:fill:#f00',
      'class:class ',
      'CLASSENTITY_IDS:a, b,c',
      'STYLECLASS: ,d e',
      'style:style ',
      'STYLE_ENTITY_IDS:a',
      'STYLE_DEFINITION_DATA:',
      'EOF:',
    ]);
    expect(jison(B + '  classDef DEFAULT x').slice(2, 3)).toEqual(['DEFAULT_CLASSDEF_ID:DEFAULT ']);
    expect(jison(B + '  class a,\n  b c').slice(2, 4)).toEqual([
      'CLASSENTITY_IDS:a,\n  b',
      'STYLECLASS: c',
    ]);
    expect(jison(B + '  classDef a')).toEqual([
      HEAD,
      'classDef:classDef ',
      'CLASSDEF_ID:a',
      'CLASSDEF_STYLEOPTS:',
    ]);
  });

  it('lexes the accessibility rules no grammar rule takes', () => {
    expect(jison(B + '  accTitle: hi\n  accDescr { x\n  }\n  a').slice(1)).toEqual([
      'acc_title:accTitle: ',
      'acc_title_value:hi',
      'acc_descr_multiline_value:x\n  ',
      'NODE_ID:a',
      'EOF:',
    ]);
  });

  it('lexes `end` with the blanks after it, word-bounded', () => {
    expect(cut(B + '  endx end\n\n  end-x')).toEqual([
      HEAD,
      'NODE_ID:endx',
      'end:end\n\n  ',
      'end:end',
      'LEXICAL_ERROR:',
    ]);
  });

  it("reads a `\"` v12 turned into `'` in a tag as `'`, and entities decoded", () => {
    expect(of(B + '  a["<b class="c">x</b>"]', T.Str).map((t) => t.text)).toEqual([
      "<b class='c'>x</b>",
    ]);
    expect(of(B + '  a#35;b a["#amp;"]', T.NodeId).map((t) => t.text)).toEqual(['a&#35;b', 'a']);
  });

  it('splits ids at line separators and other `\\s`', () => {
    expect(jison(B + '  a b c﻿d').slice(1, -1)).toEqual([
      'NODE_ID:a',
      'NODE_ID:b',
      'NODE_ID:c',
      'NODE_ID:d',
    ]);
  });
});

describe('block lexer output', () => {
  it('lexes one token across removed spans (pitfall 4)', () => {
    const src = B + '  a["x\n%% c\ny"] b%%{init: {}}%%c';
    const strs = of(src, T.Str);
    expect(strs.map((t) => t.text)).toEqual(['x\ny']);
    expect(src.slice(strs[0]?.range.start, strs[0]?.range.end)).toBe('x\n%% c\ny');
    expect(of(src, T.NodeId).map((t) => t.text)).toEqual(['a', 'bc']);
    const kinds = stream(src).map((t) => t.kind);
    expect(kinds.filter((k) => k === Kind.Comment)).toHaveLength(1);
    expect(kinds.filter((k) => k === Kind.Directive)).toHaveLength(1);
  });

  it('maps CRLF and CR line breaks to their source ranges', () => {
    const src = 'block\r\n  a["x\r\ny"]\r  b';
    const ids = of(src, T.NodeId);
    expect(ids.map((t) => src.slice(t.range.start, t.range.end))).toEqual(['a', 'b']);
    expect(of(src, T.Str).map((t) => t.text)).toEqual(['x\ny']);
  });

  it('gives the `;` v12 dropped from a classDef line to the token before it', () => {
    const src = B + '  classDef c fill:#f00;\n  a';
    const [opts] = of(src, T.ClassDefStyleOpts);
    expect(opts?.text).toBe('fill:#f00');
    expect(src.slice(opts?.range.start, opts?.range.end)).toBe('fill:#f00;');
  });

  it('writes one error per code point and lexes on in the same state', () => {
    const src = B + '  a[😀x] b';
    expect(of(src, Kind.Error).map((t) => t.text)).toEqual(['😀', 'x']);
    // Still in the shape: `]` closes it.
    expect(of(src, T.NodeDEnd).map((t) => t.text)).toEqual([']']);
  });

  it('ends with a zero-width EOF at the end of the source, blanks being no token', () => {
    const src = B + '  a   ';
    const s = stream(src);
    expect(s.map((t) => t.kind)).toEqual([T.Block, T.NodeId, T.Eof, Kind.EOF]);
    expect(s[2]).toEqual({ kind: T.Eof, start: src.length, end: src.length });
  });
});
