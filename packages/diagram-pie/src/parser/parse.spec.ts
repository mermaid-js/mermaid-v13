import { describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import { detectPie, parsePie } from './index.ts';
import type { PieSliceNode, PieTextNode } from './index.ts';
import { T } from './tokens.ts';

/**
 * The pie parser and model (#305): v12's grammar and value conversion, the model in source
 * order, D218's title, D226's duplicates, AST ids (DESIGN §4.2), symbols (D229) and spans.
 * Accept/reject and model parity over the corpus are the conformance suite's.
 */
const parse = (src: string) => parsePie(src);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('pie parser', () => {
  it('reads showData, sections in source order, title and accessibility', () => {
    const { model, diagnostics } = parse(
      'pie showData title Pets\naccTitle: A title\naccDescr: A description\n"Dogs" : 386\n"Cats": 85.5\n\'Rats\' :15'
    );
    expect(diagnostics).toEqual([]);
    expect(model).toEqual({
      showData: true,
      sections: [
        { label: 'Dogs', value: 386, astId: 'slice:Dogs' },
        { label: 'Cats', value: 85.5, astId: 'slice:Cats' },
        { label: 'Rats', value: 15, astId: 'slice:Rats' },
      ],
      title: 'Pets',
      accTitle: 'A title',
      accDescr: 'A description',
      warnings: [],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.sections)).toBe(true);
    expect(Object.isFrozen(model.sections[0])).toBe(true);
  });

  it('accepts what the grammar allows on the pie line and after it', () => {
    for (const src of [
      'pie',
      'pie showData',
      'pie "a": 1',
      'pie showData "a": 1',
      'pie title t\n"a": 1',
      'pie accDescr{x}\n"a": 1',
      '\n\npie\n\n"a": 1\n\n\n',
      'pie\n"a": 1 ---\n---',
    ]) {
      expect(errors(src), src).toEqual([]);
    }
    for (const src of [
      'pie\nshowData',
      'pie\n"a": 1 "b": 2',
      'pie pie',
      'pieChart',
      'pie\n"a": 1;',
    ]) {
      expect(errors(src), src).not.toEqual([]);
    }
  });

  it('converts labels as Langium did: either quote, escapes, line breaks, untrimmed', () => {
    const { model } = parse(
      'pie\n"a\\"b": 1\n\'c\\\'d\': 2\n" e\\nf\\t\\x ": 3\n"g\nh": 4\n"\\0\\b\\f\\v\\r\\u0041": 5'
    );
    expect(model.sections.map((s) => s.label)).toEqual([
      'a"b',
      "c'd",
      ' e\nf\tx ',
      'g\nh',
      '\0\b\f\v\ru0041',
    ]);
  });

  it('reads labels and titles as v12 lexed them: CRLF, tag quotes and entities', () => {
    const { model } = parse(
      'pie\r\ntitle a #quot;b#quot;\r\n"<b class="x">c</b>": 1\r\n"#amp;x\r\ny": 2'
    );
    expect(model.title).toBe('a &quot;b&quot;');
    expect(model.sections.map((s) => s.label)).toEqual(["<b class='x'>c</b>", '&amp;x\ny']);
  });

  it('reads values as numbers, -0 included', () => {
    const { model } = parse('pie\n"a": 0\n"b": 10.50\n"c": -0\n"d": 99999999999999999999');
    expect(model.sections.map((s) => s.value)).toEqual([0, 10.5, -0, 1e20]);
    expect(Object.is(model.sections[2]?.value, -0)).toBe(true);
  });

  it('converts titles and accessibility values, the last one winning', () => {
    const { model } = parse(
      [
        'pie',
        'title   first   %% comment',
        'title  a \t  b\tc  ',
        'accTitle :  x   y ',
        'accDescr: one',
        'accDescr {',
        '   line   one  ',
        '',
        '    line two',
        '}',
      ].join('\n')
    );
    expect(model.title).toBe('a b\tc');
    expect(model.accTitle).toBe('x y');
    expect(model.accDescr).toBe('line one\nline two');
  });

  it('keeps an empty last value, as v12 did (accTitle, accDescr)', () => {
    expect(parse('pie\naccTitle: x\naccTitle:').model.accTitle).toBe('');
    expect(parse('pie\naccDescr: x\naccDescr {}').model.accDescr).toBe('');
    expect(parse('pie\ntitle x\ntitle').model.title).toBeUndefined();
  });

  it('falls back to the front-matter title when the text has none (D218)', () => {
    const fm = '---\ntitle: Front\n---\n';
    expect(parse(`${fm}pie\n"a": 1`).model.title).toBe('Front');
    expect(parse(`${fm}pie\ntitle\n"a": 1`).model.title).toBe('Front');
    expect(parse(`${fm}pie\ntitle one\ntitle\n"a": 1`).model.title).toBe('Front');
    expect(parse(`${fm}pie title In text\n"a": 1`).model.title).toBe('In text');
    const src = `${fm}pie\n"a": 1`;
    expect(parsePie(src, { preprocessed: preprocess(src) }).model.title).toBe('Front');
    expect(parse('pie\n"a": 1').model).not.toHaveProperty('title');
  });

  it('reports a negative value with v12 message and goes on (R-PARSE-4)', () => {
    const { model, diagnostics } = parse('pie\n"dogs" : -60.67\n"cats": 2\n"rats": -1');
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        'PIE_NEGATIVE_VALUE',
        '"dogs" has invalid value: -60.67. Negative values are not allowed in pie charts. All slice values must be >= 0.',
      ],
      [
        'PIE_NEGATIVE_VALUE',
        '"rats" has invalid value: -1. Negative values are not allowed in pie charts. All slice values must be >= 0.',
      ],
    ]);
    expect(diagnostics[0]?.range).toEqual({ start: 13, end: 19 });
    expect(model.sections.map((s) => s.label)).toEqual(['cats']);
  });

  it('keeps the first of repeated labels and warns once per dropped section (D226)', () => {
    const src = 'pie\n"a": 1\n"b": 2\n"a": 3\n"a": 4';
    const { model, diagnostics, ast } = parse(src);
    expect(model.sections.map((s) => [s.label, s.value, s.astId])).toEqual([
      ['a', 1, 'slice:a'],
      ['b', 2, 'slice:b'],
    ]);
    expect(
      diagnostics.map((d) => [d.severity, d.code, src.slice(d.range.start, d.range.end)])
    ).toEqual([
      ['warning', 'PIE_DUPLICATE_SLICE', '"a": 3'],
      ['warning', 'PIE_DUPLICATE_SLICE', '"a": 4'],
    ]);
    expect(model.warnings).toEqual(diagnostics);
    expect(ast.children.map((n) => n.id)).toEqual([
      'pie',
      'slice:a',
      'slice:b',
      'slice:a@2',
      'slice:a@3',
    ]);
  });

  it('gives semantic AST ids, escaped, with ranges into the source (DESIGN §4.2)', () => {
    const src =
      'pie showData\n  title T\naccTitle: A\naccDescr {\nD\n}\ntitle U\n"a@b#c%>": 1\n"x": 2';
    const { ast } = parse(src);
    expect(ast.id).toBe('doc');
    expect(ast.children.map((n) => [n.id, n.type, src.slice(n.range.start, n.range.end)])).toEqual([
      ['pie', 'Header', 'pie showData'],
      ['title', 'Title', 'title T'],
      ['accTitle', 'AccTitle', 'accTitle: A'],
      ['accDescr', 'AccDescr', 'accDescr {\nD\n}'],
      ['title@2', 'Title', 'title U'],
      ['slice:a%40b%23c%25%3E', 'Slice', '"a@b#c%>": 1'],
      ['slice:x', 'Slice', '"x": 2'],
    ]);
    const slice = ast.children[5] as PieSliceNode;
    expect(src.slice(slice.labelRange.start, slice.labelRange.end)).toBe('"a@b#c%>"');
    expect(src.slice(slice.valueRange.start, slice.valueRange.end)).toBe('1');
    expect([slice.label, slice.value]).toEqual(['a@b#c%>', 1]);
    expect((ast.children[1] as PieTextNode).text).toBe('T');
    expect(ast.children[0]).toMatchObject({ showData: true });
  });

  it('percent-encodes in ids the characters XML cannot hold, so data-ast keeps them (#306)', () => {
    // NUL, backspace, form feed, vertical tab, DEL and a lone surrogate come out of `\\x`
    // escapes or the source; tab, LF and CR are written as character references, so they stay.
    const src = 'pie\n"\\0\\b\\f\\v\x7f\ud800\\t\\r%": 1\n"\\0": 2';
    const ids = parse(src).ast.children.map((n) => n.id);
    expect(ids).toEqual(['pie', 'slice:%00%08%0C%0B%7F%D800\t\r%25', 'slice:%00']);
    // One-to-one: a label spelling out an encoding is encoded differently.
    expect(parse('pie\n"%00": 1').ast.children[1]!.id).toBe('slice:%2500');
  });

  it('records statements and slice symbols, a repeat as a reference (D229)', () => {
    const src = 'pie\ntitle T\n"a": 1\n"a": 2';
    const { statements, symbols } = parse(src);
    expect(statements.map((s) => [s.kind, src.slice(s.range.start, s.range.end)])).toEqual([
      ['header', 'pie'],
      ['title', 'title T'],
      ['slice', '"a": 1'],
      ['slice', '"a": 2'],
    ]);
    expect(
      symbols.map((s) => [s.name, s.kind, s.role, src.slice(s.range.start, s.range.end)])
    ).toEqual([
      ['a', 'slice', 'def', '"a"'],
      ['a', 'slice', 'ref', '"a"'],
    ]);
  });

  it('keeps the preprocess diagnostics unless given the preprocess result', () => {
    const src = '---\n: [\n---\npie';
    const pre = preprocess(src);
    expect(pre.diagnostics.length).toBeGreaterThan(0);
    expect(parsePie(src).diagnostics.slice(0, pre.diagnostics.length)).toEqual(pre.diagnostics);
    expect(parsePie(src, { preprocessed: pre }).diagnostics).toEqual([]);
  });

  it('returns the tokens and a probe on request', () => {
    expect(parsePie('pie').tokens).toBeUndefined();
    expect(parsePie('pie', { keepTokens: true }).tokens?.length).toBeGreaterThan(0);
    const after = parsePie('pie\n"a" ', { probe: 8 }).probe;
    expect(after?.expected).toContain(T.Colon);
    const start = parsePie('pie\n', { probe: 4 }).probe;
    expect(start?.expected).toEqual(expect.arrayContaining([T.String, T.Title]));
    expect(parsePie('pie\n%% c', { probe: 7 }).probe?.mode).toBe('comment');
  });

  it('detects pie as v12 did', () => {
    expect(detectPie('pie')).toBe(true);
    expect(detectPie('  %% c\npie showData')).toBe(true);
    expect(detectPie('---\ntitle: x\n---\npie')).toBe(true);
    expect(detectPie('pieChart')).toBe(true);
    expect(detectPie('PIE')).toBe(false);
    expect(detectPie('flowchart')).toBe(false);
  });

  it('never throws', () => {
    for (const src of ['', '\n', '"', "pie\n'", 'pie\n"a":', 'pie\naccDescr {', 'pie\n---\n']) {
      expect(() => parsePie(src)).not.toThrow();
    }
  });
});
