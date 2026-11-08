import { describe, expect, it } from 'vitest';
import {
  VENN_DUPLICATE,
  VENN_EMPTY,
  VENN_INVALID_SIZE,
  VENN_UNION_ONE_SET,
  VENN_UNKNOWN_SET,
  VENN_UNKNOWN_TARGET,
} from '../codes.ts';
import { parseVenn } from './parser.ts';

/**
 * The venn parser through its public seam, `parseVenn`. Values marked 12.2.0 are what
 * mermaid\@12.2.0's DB holds for the same text (the conformance parity suite checks the whole
 * corpus; these pin the model-level quirks the spec lists).
 */
const parse = (body: string, head = 'venn-beta\n') => parseVenn(head + body);
const errors = (src: string) =>
  parseVenn(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
const warnings = (src: string) => parseVenn(src).model.warnings.map((d) => d.code);

describe('venn model', () => {
  it('keeps sets and overlaps in source order, with sorted member ids (12.2.0)', () => {
    const { model, diagnostics } = parse('set B\nset A\nunion B,A\nset C\nunion C,B,A');
    expect(diagnostics).toEqual([]);
    expect(model.subsets.map((s) => s.sets)).toEqual([
      ['B'],
      ['A'],
      ['A', 'B'],
      ['C'],
      ['A', 'B', 'C'],
    ]);
  });

  it('defaults a size to 10 / n² for n ids as written (12.2.0: 10, 2.5, 1.111…)', () => {
    const { model } = parse('set A\nset B\nset C\nunion A,B\nunion A,B,C\nunion A,A');
    expect(model.subsets.map((s) => s.size)).toEqual([10, 10, 10, 2.5, 10 / 9, 2.5]);
    expect(model.subsets[5]?.sets).toEqual(['A', 'A']);
  });

  it('reads sizes with parseFloat, negative ones kept (12.2.0)', () => {
    const { model } = parse('set A:01\nset B:-1\nset C:.5\nset D:+2\nset E:0');
    expect(model.subsets.map((s) => s.size)).toEqual([1, -1, 0.5, 2, 0]);
  });

  it('normalises ids and labels as v12: trimmed, one pair of quotes off (12.2.0)', () => {
    const { model } = parse('set " A "["  q "]\nset B[  spaced  ]\nset C[""]\nset ""');
    expect(model.subsets).toEqual([
      expect.objectContaining({ sets: [' A '], label: 'q' }),
      expect.objectContaining({ sets: ['B'], label: 'spaced' }),
      expect.objectContaining({ sets: ['C'] }),
      expect.objectContaining({ sets: [''] }),
    ]);
    expect(model.subsets[2]).not.toHaveProperty('label');
  });

  it('does not check the sets a text node names (12.2.0), but warns it is not drawn', () => {
    const { model, diagnostics } = parse('set A\ntext Z,Q z1\ntext A a1');
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(model.textNodes).toEqual([
      expect.objectContaining({ sets: ['Q', 'Z'], id: 'z1' }),
      expect.objectContaining({ sets: ['A'], id: 'a1' }),
    ]);
    expect(model.warnings.map((d) => d.code)).toEqual([VENN_UNKNOWN_TARGET]);
  });

  it('gives an indented text the sets of the last set or union (12.2.0)', () => {
    const { model } = parse('set A\n  text a1\nset B\nunion B,A\n  text "ab" ["AB"]\n  text 12');
    expect(model.textNodes).toEqual([
      { ast: 'text:a1', sets: ['A'], id: 'a1' },
      { ast: 'text:ab', sets: ['A', 'B'], id: 'ab', label: 'AB' },
      { ast: 'text:12', sets: ['A', 'B'], id: '12' },
    ]);
  });

  it('joins style value tokens with a blank and unquotes a string value (12.2.0)', () => {
    const { model } = parse(
      'set A\nstyle A fill: #f00 rgb(1, 2, 3), font-size: 12px, color: "a b", stroke-width: 2.5'
    );
    expect(model.styles[0]?.properties).toEqual({
      fill: '#f00 rgb(1, 2, 3)',
      'font-size': '12 px',
      color: 'a b',
      'stroke-width': '2.5',
    });
  });

  it('keeps style keys in first-written order with the last value, targets sorted (12.2.0)', () => {
    const { model } = parse('set A\nset B\nstyle B,A fill: red, stroke: 1, fill: blue');
    const style = model.styles[0];
    expect(style?.targets).toEqual(['A', 'B']);
    expect(Object.entries(style?.properties ?? {})).toEqual([
      ['fill', 'blue'],
      ['stroke', '1'],
    ]);
  });

  it('keeps the last in-text title as v12 did, one blank after `title` dropped', () => {
    expect(parse('title a\ntitle  Hello  ').model.title).toBe(' Hello  ');
  });

  it('strips one pair of surrounding quotes from the title (D416; v12 drew them)', () => {
    expect(parse('title "Team overlap"').model.title).toBe('Team overlap');
    expect(parse('title ""x""').model.title).toBe('"x"');
    expect(parse('title "a" b').model.title).toBe('"a" b');
  });

  it('falls back to the front-matter title when the in-text one is empty or absent (D218)', () => {
    const fm = '---\ntitle: From front matter\n---\n';
    expect(parseVenn(`${fm}venn-beta\nset A`).model.title).toBe('From front matter');
    expect(parseVenn(`${fm}venn-beta\ntitle ""\nset A`).model.title).toBe('From front matter');
    expect(parseVenn(`${fm}venn-beta\ntitle In text\nset A`).model.title).toBe('In text');
    expect(parseVenn('venn-beta\nset A').model).not.toHaveProperty('title');
  });

  it('parses statements without separators, as v12 (`venn-beta set A set B`)', () => {
    const { model, diagnostics } = parseVenn('venn-beta set A set B title T');
    expect(diagnostics).toEqual([]);
    expect(model.subsets.map((s) => s.sets[0])).toEqual(['A', 'B']);
    expect(model.title).toBe('T');
  });

  it('is plain data', () => {
    const { model } = parse('set A\n  text a\nstyle A fill: red\ntitle T');
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });
});

describe('venn AST ids (D418)', () => {
  it('names sets, overlaps (sorted), text nodes, styles and the title, @n for repeats', () => {
    const { ast } = parse(
      'set A\nset B\nset A:3\nunion B,A\nunion A,B\n  text t\ntext A t\nstyle A fill:red\nstyle B fill:red\ntitle x\ntitle y'
    );
    expect(ast.children.map((c) => c.id)).toEqual([
      'set:A',
      'set:B',
      'set:A@2',
      'union:A+B',
      'union:A+B@2',
      'text:t',
      'text:t@2',
      'style:1',
      'style:2',
      'title',
      'title@2',
    ]);
  });

  it('percent-encodes the separators and characters XML cannot hold', () => {
    const { ast } = parse('set "a+b"\nset "c@d#e%f>g"\nset "\u0001"\nunion "a+b","c@d#e%f>g"');
    expect(ast.children.map((c) => c.id)).toEqual([
      'set:a%2Bb',
      'set:c%40d%23e%25f%3Eg',
      'set:%01',
      'union:a%2Bb+c%40d%23e%25f%3Eg',
    ]);
  });

  it('gives the model the AST ids', () => {
    const { model } = parse('set A\nunion A,A\n  text t\nstyle A fill:red');
    expect(model.subsets.map((s) => s.ast)).toEqual(['set:A', 'union:A+A']);
    expect(model.textNodes[0]?.ast).toBe('text:t');
    expect(model.styles[0]?.ast).toBe('style:1');
  });
});

describe('venn symbols and statements (D418)', () => {
  it('defines a set at its first `set`; union, text and style ids refer to it', () => {
    const src =
      'venn-beta\nset "A"\nset B\nunion A,B\n  text t2\ntext A t1\nstyle t1 color:red\nstyle A fill:red\nset A';
    const { symbols } = parseVenn(src);
    expect(
      symbols.map((s) => [s.kind, s.name, s.role, src.slice(s.range.start, s.range.end)])
    ).toEqual([
      ['set', 'A', 'def', '"A"'],
      ['set', 'B', 'def', 'B'],
      ['set', 'A', 'ref', 'A'],
      ['set', 'B', 'ref', 'B'],
      ['text', 't2', 'def', 't2'],
      ['set', 'A', 'ref', 'A'],
      ['text', 't1', 'def', 't1'],
      ['set', 'A', 'ref', 'A'],
      // One-id style targets come last: they resolve once every set and text id is known.
      ['text', 't1', 'ref', 't1'],
      ['set', 'A', 'ref', 'A'],
    ]);
  });

  it('nests the indented text lines under their set or union, for folding', () => {
    const src = 'venn-beta\nset A\n  text a1\n  text a2\ntitle T';
    const { statements } = parseVenn(src);
    expect(
      statements.map((s) => [
        s.kind,
        src.slice(s.range.start, s.range.end),
        s.children?.length ?? 0,
      ])
    ).toEqual([
      ['header', 'venn-beta', 0],
      ['set', 'set A\n  text a1\n  text a2', 2],
      ['title', 'title T', 0],
    ]);
  });
});

describe('venn errors (R-PARSE-4)', () => {
  it('reports v12 thrown errors with its message, and goes on', () => {
    const { diagnostics, model } = parse('set A\nunion A\nunion A,Q,R\nset B');
    expect(diagnostics.map((d) => [d.code, d.message.split(':')[0]])).toEqual([
      [VENN_UNION_ONE_SET, 'union requires multiple identifiers'],
      [VENN_UNKNOWN_SET, 'unknown set identifier'],
    ]);
    expect(diagnostics[1]?.message).toMatch(/^unknown set identifier: Q, R\./);
    expect(model.subsets.map((s) => s.sets)).toEqual([['A'], ['B']]);
  });

  it('checks a union against the sets declared before it, case-sensitively (12.2.0)', () => {
    expect(errors('venn-beta\nunion A,B\nset A\nset B')).toEqual([VENN_UNKNOWN_SET]);
    expect(errors('venn-beta\nset A\nset B\nunion a,B')).toEqual([VENN_UNKNOWN_SET]);
  });

  it('reports one syntax error per line and reads the next lines', () => {
    const { diagnostics, model } = parse('set A B C\nset\nset ;;\nset D');
    expect(diagnostics.map((d) => d.code)).toEqual([
      'UNEXPECTED',
      'UNEXPECTED',
      'UNEXPECTED_CHARACTER',
    ]);
    expect(diagnostics[0]?.message).toContain('a `set` names one set');
    expect(model.subsets.map((s) => s.sets[0])).toEqual(['A', 'D']);
  });

  it('hints from the statement before only on the same line', () => {
    const message = (src: string) => parseVenn(src).diagnostics[0]?.message ?? '';
    expect(message('venn-beta\nset A B')).toContain('a `set` names one set');
    expect(message('venn-beta\nset A\nB')).not.toContain('a `set` names one set');
  });

  it('names unclosed strings and labels', () => {
    const one = (body: string) => errors(`venn-beta\n${body}\nset Z`);
    expect(one('set "A')).toEqual(['UNCLOSED_STRING']);
    expect(one('set B[x')).toEqual(['UNCLOSED_LABEL']);
    expect(one('set C[]')).toEqual(['UNEXPECTED_CHARACTER']);
    expect(one('set D[x"y]')).toEqual(['UNEXPECTED_CHARACTER']);
  });

  it('reports a missing or repeated header once', () => {
    expect(errors('set A')).toEqual(['UNEXPECTED']);
    expect(errors('venn-beta\nvenn-beta\nset A')).toEqual(['UNEXPECTED']);
  });
});

describe('venn warnings (D417)', () => {
  it('warns once for every repeated set or union', () => {
    const { model } = parse('set A\nset A:3\nset B\nunion A,B\nunion B,A');
    expect(model.warnings.map((d) => d.code)).toEqual([VENN_DUPLICATE]);
    expect(model.warnings[0]?.message).toContain('line 3');
    expect(model.warnings[0]?.message).toContain('line 6');
    expect(model.subsets).toHaveLength(5);
  });

  it('warns once for every negative size', () => {
    expect(warnings('venn-beta\nset A:-1\nset B:-2\nset C:0')).toEqual([VENN_INVALID_SIZE]);
  });

  it('warns for a style naming nothing drawn, not for a text node or 3-way pair target', () => {
    expect(warnings('venn-beta\nset A\nstyle Q fill:red')).toEqual([VENN_UNKNOWN_TARGET]);
    expect(warnings('venn-beta\nset A\n  text t\nstyle t color:red')).toEqual([]);
    expect(
      warnings('venn-beta\nset A\nset B\nset C\nunion A,B,C\nstyle A,B fill:red\ntext B,C t')
    ).toEqual([]);
  });

  it('warns an empty diagram draws only its title, unless the parse failed', () => {
    expect(warnings('venn-beta\ntitle T')).toEqual([VENN_EMPTY]);
    expect(warnings('venn-beta\nset')).toEqual([]);
  });
});
