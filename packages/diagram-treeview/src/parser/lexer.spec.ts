import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { treeViewLex, treeViewTokens } from './index.ts';
import { T } from './tokens.ts';

/**
 * What the lexer-parity gate (`packages/conformance/src/treeView/lexer-parity.spec.ts`) cannot
 * see: source ranges, above all on lines v12's box-drawing pass rewrote (D486: diagnostics point
 * at the source column), the spans v12 removed, and what the box pass reports when it fails.
 */
const slice = (src: string, t: { range: { start: number; end: number } }) =>
  src.slice(t.range.start, t.range.end);
const significant = (src: string) =>
  treeViewTokens(src).filter((t) => t.kind !== Kind.Newline && t.kind !== Kind.Comment);

describe('box-drawing source ranges', () => {
  it("maps a rewritten line's indent to its box prefix and its name to the source", () => {
    const src = 'treeView-beta\nroot/\n├── src/\n│   └── index.js\n└── README.md';
    const tokens = significant(src);
    expect(tokens.map((t) => [t.text, slice(src, t)])).toEqual([
      ['treeView-beta', 'treeView-beta'],
      ['root/', 'root/'],
      ['    ', '├── '],
      ['src/', 'src/'],
      ['        ', '│   └── '],
      ['index.js', 'index.js'],
      ['    ', '└── '],
      ['README.md', 'README.md'],
    ]);
  });

  it('keeps the tabs a rewritten name had in its range, as spaces in its text', () => {
    const src = 'treeView-beta\n├──\ta\tb :::x';
    const [, indent, name, cls] = significant(src);
    expect([indent?.text, slice(src, indent!)]).toEqual(['    ', '├──\t']);
    expect([name?.text, slice(src, name!)]).toEqual(['a    b', 'a\tb']);
    expect([cls?.kind, cls?.text, slice(src, cls!)]).toEqual([T.ClassAnnotation, ' :::x', ' :::x']);
  });

  it('maps through comment lines, CRLF and front matter, and leaves dropped lines out', () => {
    const src = '---\ntitle: t\n---\r\ntreeView-beta\r\n%% c\r\n├── a/\r\n│\r\n│   └── b\r\n';
    const names = significant(src).filter((t) => t.kind === T.BareName);
    expect(names.map((t) => [t.text, slice(src, t)])).toEqual([
      ['a/', 'a/'],
      ['b', 'b'],
    ]);
    const breaks = treeViewTokens(src).filter((t) => t.kind === Kind.Newline);
    // After the header, `a/` and `b` (the `│` line's is gone with it), and the appended one.
    expect(breaks.map((t) => slice(src, t))).toEqual(['\r\n', '\r\n', '\r\n', '']);
    const starts = treeViewTokens(src).map((t) => t.range.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("reads an annotation glued to the new indent as v12's lexer did", () => {
    const src = 'treeView-beta\n├── :::x';
    const [, cls] = significant(src);
    expect([cls?.kind, cls?.text, slice(src, cls!)]).toEqual([
      T.ClassAnnotation,
      '    :::x',
      '├── :::x',
    ]);
  });
});

describe('box-drawing errors', () => {
  it("reports v12's message, its line, and the source line", () => {
    const src = '%% c\ntreeView-beta\n├── a\n  b';
    const { box } = treeViewLex(src);
    expect(box.rewrite).toBeUndefined();
    expect(box.error?.message).toBe(
      'Line 3: Unexpected indentation without box-drawing characters. In box-drawing format, use ├── or └── prefixes for indented nodes.'
    );
    expect(box.error?.line).toBe(3);
  });

  it('lexes the text as written when the pass fails', () => {
    const src = 'treeView-beta\n├── ';
    const { box, tokens } = treeViewLex(src);
    expect(box.error?.message).toMatch(/^Line 2: Empty node/);
    expect(tokens.filter((t) => t.kind === T.BareName).map((t) => slice(src, t))).toEqual(['├── ']);
  });
});

describe('no box drawing', () => {
  it('leaves an indented tree alone', () => {
    expect(treeViewLex('treeView-beta\n  a\n    b').box).toEqual({});
  });

  it('leaves box glyphs in names alone when no content line has one', () => {
    expect(treeViewLex('treeView-beta %% x\n├── a').box).toEqual({});
    expect(treeViewLex('treeView-beta\n%% ├── a\n  b').box).toEqual({});
  });
});
