import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { mindmapTokens } from './index.ts';
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
const of = (src: string, kind: number) => mindmapTokens(src).filter((t) => t.kind === kind);
const slices = (src: string, kind: number) =>
  of(src, kind).map((t) => [t.text, src.slice(t.range.start, t.range.end)]);

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a
// token that runs over one stays one token (pitfall 4: the parity gate would not see a split).
describe('tokens across removed spans', () => {
  it('keeps a multi-line shape label split by a comment line one token', () => {
    const src = 'mindmap\n  root(\n  a\n%% c\n  b\n)\n  child';
    expect(slices(src, T.NodeDescr)).toEqual([['\n  a\n  b\n', '\n  a\n%% c\n  b\n']]);
  });

  it('keeps a node id and an icon split by a directive one token each', () => {
    const src = 'mindmap\n  ro%%{init: {}}%%ot\n  ::icon(fa %%{init: {}}%%fa-x)';
    expect(slices(src, T.NodeId)).toEqual([['root', 'ro%%{init: {}}%%ot']]);
    expect(slices(src, T.Icon)).toEqual([['fa fa-x', 'fa %%{init: {}}%%fa-x']]);
  });

  it('keeps a blank run around a comment line one token, ranges in order', () => {
    const src = 'mindmap\n  root\n\n%% c\n   \n  a';
    const tokens = stream(src);
    const lines = tokens.filter((t) => t.kind === T.SpaceLine);
    expect(lines.map((t) => src.slice(t.start, t.end))).toEqual(['\n\n%% c\n   \n']);
    const comments = tokens.filter((t) => t.kind === Kind.Comment);
    // v12's `^\s*%%…` took the blank line before the comment too.
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(['\n%% c\n']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('line breaks and the rules jison returns no token for', () => {
  it('gives a CRLF one line break from its CR, and labels LFs', () => {
    const src = 'mindmap\r\n  root(\r\n  x\r\n)\r\n\r\n  a\r\n';
    const tokens = stream(src);
    const breaks = tokens.filter((t) => t.kind === Kind.Newline || t.kind === T.SpaceLine);
    // The last CRLF and the line break v12 appended are one run.
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\r\n', '\r\n\r\n', '\r\n']);
    expect(slices(src, T.NodeDescr)).toEqual([['\n  x\n', '\r\n  x\r\n']]);
  });

  it('writes the quotes, icon and class markers as kinds of their own', () => {
    const src = 'mindmap\n  a["b"]\n  c["`d`"]\n  ::icon(e)\n  :::\n  :::f';
    const kinds = mindmapTokens(src)
      .map((t) => t.kind)
      .filter((k) => k !== T.SpaceList && k !== Kind.Newline);
    expect(kinds).toEqual([
      T.Mindmap,
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
      T.Eof,
    ]);
  });

  it('ends a stream inside a shape without the EOF token', () => {
    const kinds = mindmapTokens('mindmap\n  a(b').map((t) => t.kind);
    expect(kinds.at(-1)).toBe(T.NodeDescr);
  });

  it('writes a one-character error where jison throws, and lexes on', () => {
    const src = 'mindmap\n  a}b\n  c["`d"x`"]\n  e';
    const errors = of(src, Kind.Error).map((t) => [t.text, t.range.start]);
    expect(errors).toEqual([
      ['}', 11],
      ['"', 21],
    ]);
    expect(of(src, T.NodeId).map((t) => t.text)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('covers every character of the body with a token or trivia', () => {
    for (const src of [
      'mindmap\n  root(\n  a)\n%% c\n  ::icon(x)\n  :::y\r\n  b["`z`"] %%\n  style c:#f; ;',
      'mindmap\r\n  a{{b}}\r%% c\n  %%{init: {}}%%d e',
    ]) {
      const covered = new Set(
        stream(src).flatMap((t) => [...Array(t.end - t.start).keys()].map((k) => t.start + k))
      );
      expect([...src].every((_, k) => covered.has(k))).toBe(true);
    }
  });
});

// v12's `cleanupText` turned `="x"` into `='x'` inside a tag before lexing (D114), so the
// quotes of an attribute do not end a quoted label (#837).
describe('attribute quotes in a tag inside a quoted label', () => {
  const SHAPES = [
    ['[', ']'],
    ['(', ')'],
    ['((', '))'],
    ['))', '(('],
    [')', '('],
    ['{{', '}}'],
  ] as const;
  const LABEL = '<span style="color:red">red</span> text';
  const LEXED = "<span style='color:red'>red</span> text";

  for (const [open, close] of SHAPES) {
    for (const [what, quoted] of [
      ['a string', `"${LABEL}"`],
      ['a markdown string', `"\`${LABEL}\`"`],
    ] as const) {
      it(`lexes ${what} in ${open}…${close} as one text, root and child`, () => {
        const src = `mindmap\n  root${open}${quoted}${close}\n    a${open}${quoted}${close}\n`;
        expect(of(src, Kind.Error)).toEqual([]);
        expect(of(src, T.NodeDescr).map((t) => t.text)).toEqual([LEXED, LEXED]);
        // One character for one: the ranges are the source's.
        expect(slices(src, T.NodeDescr).map(([, s]) => s)).toEqual([LABEL, LABEL]);
      });
    }
  }
});
