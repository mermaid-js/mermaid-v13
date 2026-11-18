import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { JISON_NAMES, kanbanTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

const stream = (src: string) => {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const s = lex(src, pre.bodyStart, view).tokens;
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => kanbanTokens(src).filter((t) => t.kind === kind);
const slices = (src: string, kind: number) =>
  of(src, kind).map((t) => [t.text, src.slice(t.range.start, t.range.end)]);
/** jison terminal and text of each token with one, as the parity gate sees them. */
const jison = (src: string) =>
  kanbanTokens(src).flatMap((t) => {
    const name = JISON_NAMES[t.kind];
    return name ? [`${name}:${t.text}`] : [];
  });

// The expected streams below are v12's (the jison lexer oracle), for the quirks spec #424 lists.
describe('kanban.jison quirks', () => {
  it('rejects nothing in a bare header: `kanban` is KANBAN NL EOF, `kanban⏎` a SPACELINE', () => {
    expect(jison('kanban')).toEqual(['KANBAN:kanban', 'NL:', 'EOF:']);
    expect(jison('kanban\n')).toEqual(['KANBAN:kanban', 'SPACELINE:\n', 'EOF:']);
  });

  it('reads `kanban` case-insensitively and word-bounded, wherever a token starts', () => {
    // So an item whose text starts with the word is a KANBAN token (v12 rejects it).
    expect(jison('kanban\n  Kanban board').slice(2, 5)).toEqual([
      'SPACELIST:  ',
      'KANBAN:Kanban',
      'SPACELIST: ',
    ]);
    expect(jison('kanbanx\n  a')[0]).toBe('NODE_ID:kanbanx');
    expect(jison('kanban\n  kanbanCard\n    mykanban')).toContain('NODE_ID:kanbanCard');
  });

  it('opens shape data with an empty-image SHAPE_DATA whose range covers `@{`', () => {
    const src = 'kanban\n  a@{ x: 1 }';
    expect(slices(src, T.ShapeDataStart)).toEqual([['', '@{']]);
    expect(jison(src)).toEqual([
      'KANBAN:kanban',
      'NL:\n',
      'SPACELIST:  ',
      'NODE_ID:a',
      'SHAPE_DATA:',
      'SHAPE_DATA: x: 1 ',
      'NL:',
      'EOF:',
    ]);
    // The closing `}` is a kind with no jison name.
    expect(slices(src, T.ShapeDataEnd)).toEqual([['}', '}']]);
  });

  it('makes each quote in shape data a SHAPE_DATA, and `\\n\\s*` inside quotes a <br/>', () => {
    const src = 'kanban\n  a\n    b@{ label: "x\n   y", t: "z" }';
    expect(jison(src).slice(7)).toEqual([
      'SHAPE_DATA:',
      'SHAPE_DATA: label: ',
      'SHAPE_DATA:"',
      'SHAPE_DATA:x<br/>y',
      'SHAPE_DATA:"',
      'SHAPE_DATA:, t: ',
      'SHAPE_DATA:"',
      'SHAPE_DATA:z',
      'SHAPE_DATA:"',
      'SHAPE_DATA: ',
      'NL:',
      'EOF:',
    ]);
    expect(of(src, T.ShapeDataQuote)).toHaveLength(4);
    expect(slices(src, T.ShapeDataStr)[0]).toEqual(['x<br/>y', 'x\n   y']);
  });

  it("reads the quotes of a tag attribute as `'` before lexing, in a label and in data (#837)", () => {
    // v12's `cleanupText` turned `="x"` into `='x'` inside a tag (D114): the quotes end no
    // string and open no quoted run.
    const src = 'kanban\n  a["<b class="k">b</b>"]@{ ticket: "<i id="t">T</i>" }';
    expect(jison(src)).toEqual([
      'KANBAN:kanban',
      'NL:\n',
      'SPACELIST:  ',
      'NODE_ID:a',
      'NODE_DSTART:[',
      "NODE_DESCR:<b class='k'>b</b>",
      'NODE_DEND:]',
      'SHAPE_DATA:',
      'SHAPE_DATA: ticket: ',
      'SHAPE_DATA:"',
      "SHAPE_DATA:<i id='t'>T</i>",
      'SHAPE_DATA:"',
      'SHAPE_DATA: ',
      'NL:',
      'EOF:',
    ]);
    expect(of(src, Kind.Error)).toEqual([]);
  });

  it('ends a quoted run left open at the end in <br/>: it took the appended line break', () => {
    const src = 'kanban\n  a\n    b@{ x: "abc';
    expect(jison(src).slice(-2)).toEqual(['SHAPE_DATA:"', 'SHAPE_DATA:abc<br/>']);
    expect(jison('kanban\n  a\n    b@{ x: "').at(-1)).toBe('SHAPE_DATA:<br/>');
  });

  it('keeps line breaks in unquoted shape data, and joins two blocks back to back', () => {
    expect(jison('kanban\n  a\n    b@{\n      t: X\n    }').slice(7, 9)).toEqual([
      'SHAPE_DATA:',
      'SHAPE_DATA:\n      t: X\n    ',
    ]);
    expect(jison('kanban\n  a\n    b@{x: 1}@{y: 2}').slice(7, 11)).toEqual([
      'SHAPE_DATA:',
      'SHAPE_DATA:x: 1',
      'SHAPE_DATA:',
      'SHAPE_DATA:y: 2',
    ]);
  });

  it('makes `^` in shape data and an `@` that starts no `@{` lexical errors', () => {
    expect(jison('kanban\n  a@{ x: ^ }').slice(3, 7)).toEqual([
      'NODE_ID:a',
      'SHAPE_DATA:',
      'SHAPE_DATA: x: ',
      'LEXICAL_ERROR:^',
    ]);
    expect(jison('kanban\n  a@b').slice(3, 6)).toEqual([
      'NODE_ID:a',
      'LEXICAL_ERROR:@',
      'NODE_ID:b',
    ]);
    // Lexing goes on in the same state after an error.
    expect(of('kanban\n  a@{ x^y }', T.ShapeData).map((t) => t.text)).toEqual([' x', 'y ']);
  });

  it('backtracks `[\\s]+[\\n]` to the last line break of a blank run', () => {
    const src = 'kanban\n  a  \n   \n  b';
    expect(jison(src)).toEqual([
      'KANBAN:kanban',
      'NL:\n',
      'SPACELIST:  ',
      'NODE_ID:a  ',
      'SPACELINE:\n   \n',
      'SPACELIST:  ',
      'NODE_ID:b',
      'NL:',
      'EOF:',
    ]);
  });

  it('takes the blanks before a `%%` left mid-line into the SPACELINE; an id keeps its own', () => {
    expect(jison('kanban\n  a[b]   %% c\n  d')).toContain('SPACELINE:   %% c');
    expect(jison('kanban\n  a   %% c\n  b')).toContain('NODE_ID:a   %% c');
  });

  it('spans line breaks in a shape, and takes the rest of the line after a `}`', () => {
    expect(slices('kanban\n  a(\n  The\n  column\n)', T.NodeDescr)).toEqual([
      ['\n  The\n  column\n', '\n  The\n  column\n'],
    ]);
    expect(jison('kanban\n  a[x}y]').slice(4)).toEqual([
      'NODE_DSTART:[',
      'NODE_DESCR:x',
      'NODE_DESCR:}y]',
      'NODE_DESCR:',
    ]);
    // `(` closes a label opened with `[`.
    expect(jison('kanban\n  a[x(y)]').slice(4, 8)).toEqual([
      'NODE_DSTART:[',
      'NODE_DESCR:x',
      'NODE_DEND:(',
      'NODE_ID:y',
    ]);
  });

  it('makes `accTitle: x`, `accDescr: x` and `title x` item ids: kanban has no such statements', () => {
    expect(jison('kanban\n  accTitle: x\n  accDescr: x\n  title x')).toEqual([
      'KANBAN:kanban',
      'NL:\n',
      'SPACELIST:  ',
      'NODE_ID:accTitle: x',
      'NL:\n',
      'SPACELIST:  ',
      'NODE_ID:accDescr: x',
      'NL:\n',
      'SPACELIST:  ',
      'NODE_ID:title x',
      'NL:',
      'EOF:',
    ]);
  });

  it('reads entity codes, which v12 encoded before lexing, as entities in the token written', () => {
    // v12's images hold its placeholders, which read as HTML entities (`#59;` as `&#59;`);
    // their `#` and `;` neither split nor end a token.
    const src = 'kanban\n  a[#59; #quot;b#quot;]\n    c#amp;d@{ label: "#lt;e" }';
    expect(jison(src)).toEqual([
      'KANBAN:kanban',
      'NL:\n',
      'SPACELIST:  ',
      'NODE_ID:a',
      'NODE_DSTART:[',
      'NODE_DESCR:&#59; &quot;b&quot;',
      'NODE_DEND:]',
      'NL:\n',
      'SPACELIST:    ',
      'NODE_ID:c&amp;d',
      'SHAPE_DATA:',
      'SHAPE_DATA: label: ',
      'SHAPE_DATA:"',
      'SHAPE_DATA:&lt;e',
      'SHAPE_DATA:"',
      'SHAPE_DATA: ',
      'NL:',
      'EOF:',
    ]);
  });

  it('lexes CRLF as LF', () => {
    expect(jison('kanban\r\n  a\r\n    b')).toEqual(jison('kanban\n  a\n    b'));
  });
});

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a
// token that runs over one stays one token (pitfall 4: the parity gate would not see a split).
describe('tokens across removed spans', () => {
  it('keeps a multi-line label split by a comment line one token', () => {
    const src = 'kanban\n  a(\n  b\n%% c\n  d\n)\n    e';
    expect(slices(src, T.NodeDescr)).toEqual([['\n  b\n  d\n', '\n  b\n%% c\n  d\n']]);
  });

  it('keeps shape data split by a comment line one token, and a quoted run too', () => {
    const src = 'kanban\n  a\n    b@{\n%% c\n      t: X\n    }';
    expect(slices(src, T.ShapeData)).toEqual([['\n      t: X\n    ', '\n%% c\n      t: X\n    ']]);
    const quoted = 'kanban\n  a\n    b@{ label: "x\n%% c\n  y" }';
    expect(slices(quoted, T.ShapeDataStr)).toEqual([['x<br/>y', 'x\n%% c\n  y']]);
  });

  it('ends a quoted run left open before a removed last comment line in <br/>', () => {
    expect(jison('kanban\n  a\n    b@{ x: "abc\n%% c').at(-1)).toBe('SHAPE_DATA:abc<br/>');
  });

  it('keeps an id and an icon split by a directive one token each', () => {
    const src = 'kanban\n  ro%%{init: {}}%%ot\n  ::icon(fa %%{init: {}}%%fa-x)';
    expect(slices(src, T.NodeId)).toEqual([['root', 'ro%%{init: {}}%%ot']]);
    expect(slices(src, T.Icon)).toEqual([['fa fa-x', 'fa %%{init: {}}%%fa-x']]);
  });

  it('keeps a blank run around a comment line one token, ranges in order', () => {
    const src = 'kanban\n  a\n\n%% c\n   \n  b';
    const tokens = stream(src);
    const lines = tokens.filter((t) => t.kind === T.SpaceLine);
    expect(lines.map((t) => src.slice(t.start, t.end))).toEqual(['\n\n%% c\n   \n']);
    const comments = tokens.filter((t) => t.kind === Kind.Comment);
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(['\n%% c\n']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('line breaks and the rules jison returns no token for', () => {
  it('gives a CRLF one line break from its CR, and labels and shape data LFs', () => {
    const src = 'kanban\r\n  a(\r\n  x\r\n)\r\n\r\n    b@{\r\n  t: X\r\n}\r\n';
    const tokens = stream(src);
    const breaks = tokens.filter((t) => t.kind === Kind.Newline || t.kind === T.SpaceLine);
    // The last CRLF and the line break v12 appended are one run.
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\r\n', '\r\n\r\n', '\r\n']);
    expect(slices(src, T.NodeDescr)).toEqual([['\n  x\n', '\r\n  x\r\n']]);
    expect(slices(src, T.ShapeData)).toEqual([['\n  t: X\n', '\r\n  t: X\r\n']]);
  });

  it('writes the quotes, icon, class and shape data markers as kinds of their own', () => {
    const src = 'kanban\n  a["b"]\n  c["`d`"]\n  ::icon(e)\n  :::\n  :::f\n  g@{ h: "i" }';
    const kinds = kanbanTokens(src)
      .map((t) => t.kind)
      .filter((k) => k !== T.SpaceList && k !== Kind.Newline);
    expect(kinds).toEqual([
      T.Kanban,
      T.NodeId,
      T.NodeDStart,
      T.StringStart,
      T.NodeDescr,
      T.StringEnd,
      T.NodeDEnd,
      T.NodeId,
      T.NodeDStart,
      T.MdStringStart,
      T.NodeDescr,
      T.MdStringEnd,
      T.NodeDEnd,
      T.IconStart,
      T.Icon,
      T.IconEnd,
      T.ClassStart,
      T.ClassEnd,
      T.ClassStart,
      T.Class,
      T.NodeId,
      T.ShapeDataStart,
      T.ShapeData,
      T.ShapeDataQuote,
      T.ShapeDataStr,
      T.ShapeDataQuote,
      T.ShapeData,
      T.ShapeDataEnd,
      T.Eof,
    ]);
  });

  it('ends a stream inside a shape or shape data without the EOF token', () => {
    expect(kanbanTokens('kanban\n  a(b').at(-1)?.kind).toBe(T.NodeDescr);
    expect(kanbanTokens('kanban\n  a@{ b').at(-1)?.kind).toBe(T.ShapeData);
  });

  it('writes a one-character error where jison throws, and lexes on', () => {
    const src = 'kanban\n  a}b\n  c["`d"x`"]\n  e@f\n  g@{ ^ }';
    const errors = of(src, Kind.Error).map((t) => [t.text, t.range.start]);
    expect(errors).toEqual([
      ['}', 10],
      ['"', 20],
      ['@', 29],
      ['^', 38],
    ]);
    expect(of(src, T.NodeId).map((t) => t.text)).toEqual(['a', 'b', 'c', 'e', 'f', 'g']);
  });

  it('covers every character of the body with a token or trivia', () => {
    for (const src of [
      'kanban\n  a(\n  b)\n%% c\n  ::icon(x)\n  :::y\r\n  c["`z`"] %%\n  style d:#f; ;',
      'kanban\r\n  a{{b}}\r%% c\n  %%{init: {}}%%d e@{ f: "g\r\nh" }',
    ]) {
      const covered = new Set(
        stream(src).flatMap((t) => [...Array(t.end - t.start).keys()].map((k) => t.start + k))
      );
      expect([...src].every((_, k) => covered.has(k))).toBe(true);
    }
  });
});
