import { describe, expect, it } from 'vitest';
import {
  parseSankey,
  SANKEY_CYCLE,
  SANKEY_INVALID_VALUE,
  SANKEY_VALUE_TRAILING_TEXT,
} from '../index.ts';
import type { SankeyLinkNode } from '../index.ts';

/**
 * The sankey parser and its model (spec #427 T2). Expected names and values are mermaid\@12's
 * `getGraph()` on the same text (oracle-checked, 12.2.0); ranges and ids are v13's (D397).
 */
const graph = (src: string) => {
  const { model } = parseSankey(src);
  return {
    nodes: model.nodes.map((n) => n.id),
    links: model.links.map((l) => [l.source, l.target, l.value]),
  };
};
const errors = (src: string) =>
  parseSankey(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
const at = (src: string, r: { start: number; end: number }) => src.slice(r.start, r.end);

describe('sankey parse: v12 model', () => {
  it('lists nodes in first-appearance order and keeps repeated links', () => {
    expect(graph('sankey\nb,a,1\na,c,2\nb,a,3')).toEqual({
      nodes: ['b', 'a', 'c'],
      links: [
        ['b', 'a', 1],
        ['a', 'c', 2],
        ['b', 'a', 3],
      ],
    });
  });

  it('reads sankey-beta, blank lines, indented rows and comment lines', () => {
    expect(graph('sankey-beta\n\n  a , b , 1  \n%% c\n\n\nb,c,2')).toEqual({
      nodes: ['a', 'b', 'c'],
      links: [
        ['a', 'b', 1],
        ['b', 'c', 2],
      ],
    });
  });

  it('trims quoted names and reads "" as "', () => {
    expect(graph('sankey\n"a,1","b ""q""",3\n" a ",d,1\n"""x""",e,1')).toEqual({
      nodes: ['a,1', 'b "q"', 'a', 'd', '"x"', 'e'],
      links: [
        ['a,1', 'b "q"', 3],
        ['a', 'd', 1],
        ['"x"', 'e', 1],
      ],
    });
  });

  it('keeps line breaks inside quotes, a run of them as one', () => {
    expect(graph('sankey\n"a\n\n\nb",c,1')).toEqual({
      nodes: ['a\nb', 'c'],
      links: [['a\nb', 'c', 1]],
    });
  });

  it('takes parseFloat of the value, as v12 did', () => {
    const src = 'sankey\na,b,1e3\nb,c,1;\nc,d,1 2\nd,e,abc\ne,f,-3\nf,g,0x10\ng,h," 7 "\nh,i,.5';
    expect(graph(src).links.map((l) => l[2])).toEqual([1000, 1, 1, NaN, -3, 0, 7, 0.5]);
  });

  it('keeps HTML and __proto__ names as written', () => {
    expect(graph('sankey\n<b>y</b>,&lt;x,1\n__proto__,constructor,2').nodes).toEqual([
      '<b>y</b>',
      '&lt;x',
      '__proto__',
      'constructor',
    ]);
  });

  it('keeps the front-matter title (D396)', () => {
    expect(parseSankey('---\ntitle: Flows\n---\nsankey\na,b,1').model.title).toBe('Flows');
    expect(parseSankey('sankey\na,b,1').model.title).toBeUndefined();
  });
});

describe('sankey parse: AST ids and ranges (D397)', () => {
  it('gives each node its first occurrence and each row a link id, @k for repeats', () => {
    const src = 'sankey\na,b,1\nb,c,2\na,b,3';
    const r = parseSankey(src);
    expect(r.model.nodes.map((n) => n.ast)).toEqual(['node:a', 'node:b', 'node:c']);
    expect(r.model.links.map((l) => l.ast)).toEqual(['link:a->b', 'link:b->c', 'link:a->b@2']);
    const rows = r.ast.children;
    expect(rows.map((l) => l.id)).toEqual(['link:a->b', 'link:b->c', 'link:a->b@2']);
    expect(rows.map((l) => (l.children ?? []).map((n) => n.id))).toEqual([
      ['node:a', 'node:b'],
      ['node:c'],
      [],
    ]);
  });

  it('escapes %, >, @ and # so ids never collide', () => {
    const r = parseSankey('sankey\na->b,c,1\na,>b-c,1\nx@2,y#,1\n100%,z,1');
    const ids = r.ast.children.map((l) => l.id);
    expect(ids).toEqual(['link:a-%3Eb->c', 'link:a->%3Eb-c', 'link:x%402->y%23', 'link:100%25->z']);
    const all = [...ids, ...r.model.nodes.map((n) => n.ast)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('ranges a name at its trimmed field or its quoted string, a row from first to last field', () => {
    const src = 'sankey\n  a ,"b c", 1  \n';
    const r = parseSankey(src);
    expect(r.model.nodes.map((n) => at(src, n.range))).toEqual(['a', '"b c"']);
    const row = r.ast.children[0] as SankeyLinkNode;
    expect(at(src, row.range)).toBe('a ,"b c", 1');
    expect(at(src, row.value.range)).toBe('1');
    expect(r.statements.map((s) => [s.kind, at(src, s.range)])).toEqual([
      ['header', 'sankey'],
      ['link', 'a ,"b c", 1'],
    ]);
  });

  it('maps ranges through CRLF, comments and directives', () => {
    const src = 'sankey\r\n%% c\r\na,%%{init: {}}%%b,1\r\nc%%{init: {}}%%x,d,2';
    const r = parseSankey(src);
    expect(r.diagnostics).toEqual([]);
    // A name with a directive through it is one token: its range covers the directive.
    expect(r.model.nodes.map((n) => at(src, n.range))).toEqual(['a', 'b', 'c%%{init: {}}%%x', 'd']);
    expect(r.model.nodes.map((n) => n.id)).toEqual(['a', 'b', 'cx', 'd']);
  });
});

describe('sankey parse: cycles (D393)', () => {
  const message = (node: string) =>
    `Sankey diagrams cannot have circular links, and "${node}" is part of one.`;

  it('rejects a self-link at it', () => {
    const src = 'sankey\na,b,1\nc,c,2';
    const [d] = parseSankey(src).diagnostics;
    expect(d).toMatchObject({ severity: 'error', code: SANKEY_CYCLE, message: message('c') });
    expect(at(src, d!.range)).toBe('c,c,2');
  });

  it('reports a cycle once, at its first link in row order', () => {
    const src = 'sankey\nx,a,1\na,b,1\nb,c,1\nc,a,1\nc,y,1';
    const d = parseSankey(src).diagnostics;
    expect(d.map((x) => [x.code, x.message, at(src, x.range)])).toEqual([
      [SANKEY_CYCLE, message('a'), 'a,b,1'],
    ]);
  });

  it('reports each group of nodes on a cycle', () => {
    expect(errors('sankey\na,b,1\nb,a,1\nc,d,1\nd,e,1\ne,c,1\nf,f,1')).toEqual([
      SANKEY_CYCLE,
      SANKEY_CYCLE,
      SANKEY_CYCLE,
    ]);
  });

  it('accepts a DAG with shared targets and a long chain', () => {
    const chain = Array.from({ length: 5000 }, (_, k) => `n${k},n${k + 1},1`).join('\n');
    expect(errors(`sankey\na,b,1\na,c,1\nb,d,1\nc,d,1\n${chain}`)).toEqual([]);
    expect(errors(`sankey\n${chain}\nn5000,n0,1`)).toEqual([SANKEY_CYCLE]);
  });
});

describe('sankey parse: values (D394)', () => {
  it('counts NaN, negative and infinite values as 0, with one warning listing every row', () => {
    const src = 'sankey\na,b,abc\nb,c,2\nc,d,-1\nd,e,Infinity\ne,f,0';
    const r = parseSankey(src);
    expect(r.model.links.map((l) => l.flow)).toEqual([0, 2, 0, 0, 0]);
    const warnings = r.diagnostics.filter((d) => d.code === SANKEY_INVALID_VALUE);
    expect(warnings).toHaveLength(1);
    const [w] = warnings;
    expect(w!.severity).toBe('warning');
    expect(at(src, w!.range)).toBe('abc');
    expect(w!.related?.map((x) => at(src, x.range))).toEqual(['abc', '-1', 'Infinity']);
    expect((w as { astIds?: string[] }).astIds).toEqual(['link:a->b', 'link:c->d', 'link:d->e']);
    expect(r.model.warnings).toEqual(r.diagnostics);
  });

  it('warns once per value with text after its number, at that text', () => {
    const src = 'sankey\na,b,1;\nb,c,"2 x"\nc,d,3 %% n\nd,e,4';
    const r = parseSankey(src);
    expect(r.model.links.map((l) => l.value)).toEqual([1, 2, 3, 4]);
    const d = r.diagnostics.filter((x) => x.code === SANKEY_VALUE_TRAILING_TEXT);
    expect(d.map((x) => at(src, x.range))).toEqual([';', 'x', '%% n']);
    expect(d[0]!.message).toBe(
      'Only the number at the start of the value "1;" is read (1): the text ";" after it is ignored.'
    );
  });

  it('raises nothing for well-formed values', () => {
    expect(parseSankey('sankey\na,b,1.5\nb,c,1e3\nc,d,+2\nd,e,.5\ne,f,5.').diagnostics).toEqual([]);
  });
});

describe('sankey parse: errors', () => {
  it.each([
    ['sankey', 'UNEXPECTED'],
    ['sankey a,b,1', 'UNEXPECTED'],
    ['sankey   \na,b,1', 'UNEXPECTED'],
    ['sankeyx\na,b,1', 'UNEXPECTED'],
    ['sankey\na,b', 'UNEXPECTED'],
    ['sankey\na,b,1,2', 'UNEXPECTED'],
    ['sankey\n,b,1', 'UNEXPECTED'],
    ['sankey\n"a" ,b,1', 'UNEXPECTED'],
    ['sankey\n"",b,1', 'UNEXPECTED'],
    ['sankey\n"abc,b,1', 'UNCLOSED_STRING'],
    ['sankey\nZürich,b,1', 'UNEXPECTED'],
    ['sankey\na\tb,c,1', 'UNEXPECTED'],
    ['sankey\na#9829;b,c,1', 'UNEXPECTED'],
    ['sankey\na,b,1\n   \nc,d,2', 'UNEXPECTED'],
  ])('rejects %j (v12 does too) with one diagnostic', (src, code) => {
    expect(errors(src)).toEqual([code]);
  });

  it('keeps a later sankey as the header when the first line is not one', () => {
    const r = parseSankey('sankeyx\nSANKEY\na,b,1');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNEXPECTED']);
    expect(r.model.links).toHaveLength(1);
  });

  it('says what was found and what to do, in Mermaid terms', () => {
    const msg = (src: string) => parseSankey(src).diagnostics[0]?.message;
    expect(msg('sankey\na,b')).toBe(
      'Expected a comma, got the end of the text; a row has three fields: source, target and value.'
    );
    expect(msg('sankey\nZürich,b,1')).toBe(
      'Expected a comma, got `ü`; sankey text takes printable ASCII characters only.'
    );
    expect(msg('sankey\n"abc,b,1')).toBe(
      'Unclosed quote: the `"` at line 2 has no closing `"`. Add `"` after the field\'s text.'
    );
  });
});
