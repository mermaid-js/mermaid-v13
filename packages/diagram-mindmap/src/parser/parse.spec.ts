import { describe, expect, it } from 'vitest';
import { parseMindmap } from '../index.ts';
import type { MindmapModel } from '../index.ts';

/** Parse and expect no error. */
const model = (src: string, colorBy?: 'branch' | 'depth'): MindmapModel => {
  const r = parseMindmap(src, colorBy ? { colorBy } : {});
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
};

const errors = (src: string) =>
  parseMindmap(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('mindmap parser: tree', () => {
  it('nests by indent: a parent is the nearest node above with less indent', () => {
    const m = model('mindmap\n  root\n    a\n      b\n    c\n        d\n');
    expect(m.nodes.map((n) => [n.id, n.parent, n.depth, n.level])).toEqual([
      ['root', undefined, 0, 0],
      ['a', 0, 1, 2],
      ['b', 1, 2, 4],
      ['c', 0, 1, 2],
      ['d', 3, 2, 6],
    ]);
    expect(m.nodes[0]?.children).toEqual([1, 3]);
  });

  it('keeps v12 level (indent less the root indent) next to the tree depth', () => {
    const m = model(
      'mindmap\n    root((Root))\n          ownerA\n            repoA\n                leafA\n              leafB\n'
    );
    expect(m.nodes.map((n) => [n.level, n.depth])).toEqual([
      [0, 0],
      [6, 1],
      [8, 2],
      [12, 3],
      [10, 3],
    ]);
  });

  it('counts a tab as one, and takes a root on the header line', () => {
    expect(model('mindmap\nroot\n\ta\n\t\tb\n').nodes.map((n) => n.level)).toEqual([0, 1, 2]);
    expect(model('mindmap root\n  a\n').nodes.map((n) => [n.id, n.depth])).toEqual([
      ['root', 0],
      ['a', 1],
    ]);
  });

  it('a second root is an error, and the parse goes on', () => {
    const r = parseMindmap('mindmap\n  root\n  second\n    a\n');
    expect(r.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        'MINDMAP_SECOND_ROOT',
        'There can be only one root. No parent could be found for ("second"). Indent it deeper than the first node, the root.',
      ],
    ]);
    // v12's backward scan: `a` hangs under the root, the second root is not in the tree.
    expect(r.model.nodes.map((n) => [n.id, n.parent])).toEqual([
      ['root', undefined],
      ['a', 0],
    ]);
    expect(r.ast.children.map((c) => c.id)).toEqual(['n:root', 'n:second', 'n:a']);
  });

  it('names the label, not the id, in the second-root message (as v12)', () => {
    const r = parseMindmap('mindmap\n  root\n  x[The label]\n');
    expect(r.diagnostics[0]?.message).toContain('("The label")');
  });

  it('builds a 10k-node chain and fan without a per-node scan', () => {
    const chain = [
      'mindmap',
      'root',
      ...Array.from({ length: 2000 }, (_, k) => `${' '.repeat(k + 1)}n${k}`),
    ];
    // Past the default depth limit (100): lifted here, as an integrator can.
    const deep = parseMindmap(chain.join('\n'), { maxDepth: Infinity });
    expect(deep.diagnostics).toEqual([]);
    const m = deep.model;
    expect(m.nodes.at(-1)?.depth).toBe(2000);
    // The root and 9,999 children: the default node limit.
    const fan = ['mindmap', 'root', ...Array.from({ length: 9_999 }, (_, k) => `  n${k}`)];
    expect(model(fan.join('\n')).nodes[0]?.children).toHaveLength(9_999);
  });
});

describe('mindmap parser: limits (R-SEC-5)', () => {
  const chain = (n: number) =>
    ['mindmap', ...Array.from({ length: n }, (_, k) => `${' '.repeat(k + 1)}n${k}`)].join('\n');
  const limitErrors = (src: string, options: { maxNodes?: number; maxDepth?: number }) =>
    parseMindmap(src, options).diagnostics.map((d) => `${d.code} ${d.range.start}`);

  it('reports the node cap once, at the first node over it', () => {
    const src = chain(8);
    expect(limitErrors(src, { maxNodes: 5 })).toEqual([`NODE_LIMIT ${src.indexOf('n5')}`]);
    expect(limitErrors(src, { maxNodes: 8 })).toEqual([]);
  });

  it('reports the depth cap once, at the first node deeper than it', () => {
    const src = chain(8);
    // n3 is three levels under the root n0.
    expect(limitErrors(src, { maxDepth: 2 })).toEqual([`DEPTH_LIMIT ${src.indexOf('n3')}`]);
    expect(limitErrors(src, { maxDepth: 7 })).toEqual([]);
    expect(parseMindmap(src, { maxDepth: 2 }).diagnostics[0]?.message).toMatch(
      /nested 3 deep here, over the limit of 2\. The limit is set by the page or app/
    );
  });

  it('defaults to core’s limits', () => {
    expect(errors(chain(102))).toEqual(['DEPTH_LIMIT']);
    expect(errors(chain(101))).toEqual([]);
  });
});

describe('mindmap parser: nodes', () => {
  it('takes the shape from the opener; `(` is rounded only when closed by `)`', () => {
    const m = model(
      'mindmap\n  root\n    a[x]\n    b(x)\n    c((x))\n    d)x(\n    e))x((\n    f{{x}}\n    g\n    h(x]\n    i(x((\n    (-j-)\n    -)k(-\n    l-)x(-\n'
    );
    expect(m.nodes.slice(1).map((n) => `${n.id}:${n.shape}`)).toEqual([
      'a:rect',
      'b:rounded',
      'c:circle',
      'd:cloud',
      'e:bang',
      'f:hexagon',
      'g:default',
      'h:cloud',
      'i:cloud',
      'j-:default',
      'k:default',
      // The id takes the `-`, so `)` opens a cloud.
      'l-:cloud',
    ]);
  });

  it('a node without an id takes its label as id', () => {
    const [n] = model('mindmap\n  ((The root))\n').nodes;
    expect([n?.id, n?.label, n?.shape, n?.ast]).toEqual([
      'The root',
      'The root',
      'circle',
      'n:The root',
    ]);
  });

  it('keeps labels raw: line breaks in a shape, string insides, markdown, entities', () => {
    const m = model(
      'mindmap\n  root(\n    The root\n  )\n    a["String containing []"]\n    b["`**md**`"]\n    c[#quot;hi#quot;]\n    d e\n'
    );
    expect(m.nodes.map((n) => n.label)).toEqual([
      '\n    The root\n  ',
      'String containing []',
      '**md**',
      '&quot;hi&quot;',
      'd e',
    ]);
  });

  it('keeps v12 ids: blanks, colons and a comment after a shapeless node', () => {
    const m = model('mindmap\n  root\n    a:::b\n    c %% d\n    e(f) %% g\n');
    expect(m.nodes.slice(1).map((n) => [n.id, n.classes])).toEqual([
      ['a:::b', []],
      ['c %% d', []],
      ['e', []],
    ]);
  });
});

describe('mindmap parser: decorations', () => {
  it('a class line sets the classes of the last node, whatever its indent', () => {
    const m = model('mindmap\n  root\n    a\n      b\n  :::urgent large\n');
    expect(m.nodes.map((n) => n.classes)).toEqual([[], [], ['urgent', 'large']]);
  });

  it('a second class line replaces the classes; a blank one clears them', () => {
    expect(model('mindmap\n  root\n  :::a b\n  :::c\n').nodes[0]?.classes).toEqual(['c']);
    expect(model('mindmap\n  root\n  :::a b\n  ::: \n').nodes[0]?.classes).toEqual([]);
    expect(model('mindmap\n  root\n  :::a b\n  :::\n').nodes[0]?.classes).toEqual(['a', 'b']);
  });

  it('an icon is kept as written with its range; a later one replaces it', () => {
    const src = 'mindmap\n  root\n  ::icon(x)\n  ::icon(fa fa-book)\n';
    const icon = model(src).nodes[0]?.icon;
    expect(icon?.text).toBe('fa fa-book');
    expect(src.slice(icon?.range.start, icon?.range.end)).toBe('fa fa-book');
  });

  it('decorations belong to their node in the AST', () => {
    const src = 'mindmap\n  root\n  :::a\n  ::icon(b)\n';
    const [node] = parseMindmap(src).ast.children;
    expect(
      node?.decorations.map((d) => [d.type, d.text, src.slice(d.range.start, d.range.end)])
    ).toEqual([
      ['Class', 'a', ':::a'],
      ['Icon', 'b', '::icon(b)'],
    ]);
  });

  it('a decoration before any node is an error, and the parse goes on', () => {
    const r = parseMindmap('mindmap\n  ::icon(x)\n  root\n');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['MINDMAP_DECORATION_BEFORE_NODE']);
    expect(r.model.nodes.map((n) => [n.id, n.icon])).toEqual([['root', undefined]]);
  });
});

describe('mindmap parser: sections', () => {
  const SRC =
    'mindmap\n    root((Root))\n          ownerA{{Owner A}}\n            repoA[Repo A]\n                leafA[Leaf A]\n              leafB[Leaf B]\n          ownerB{{Owner B}}\n              repoB[Repo B]\n                leafC[Leaf C]\n';

  it('per top-level branch by default', () => {
    expect(model(SRC).nodes.map((n) => n.section)).toEqual([undefined, 0, 0, 0, 0, 1, 1, 1]);
  });

  it('per depth with colorBy depth', () => {
    expect(model(SRC, 'depth').nodes.map((n) => n.section)).toEqual([
      undefined,
      0,
      1,
      2,
      2,
      0,
      1,
      2,
    ]);
  });

  it('wrap after eleven branches', () => {
    const src = ['mindmap', 'root', ...Array.from({ length: 13 }, (_, k) => `  b${k}`)].join('\n');
    expect(
      model(src)
        .nodes.slice(1)
        .map((n) => n.section)
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 1]);
  });
});

describe('mindmap parser: AST, statements, syntax', () => {
  it('node ids are n:<id>, repeats n:<id>@k, blanks around the id dropped', () => {
    const r = parseMindmap('mindmap\n  a\n    a \n      a[x]\n    b\n');
    expect(r.ast.children.map((c) => c.id)).toEqual(['n:a', 'n:a@2', 'n:a@3', 'n:b']);
    expect(r.model.nodes.map((n) => n.ast)).toEqual(['n:a', 'n:a@2', 'n:a@3', 'n:b']);
  });

  it('a node range runs from its id to its closer', () => {
    const src = 'mindmap\n  root\n    id[the text]\n    (no id)\n';
    expect(
      parseMindmap(src).ast.children.map((c) => src.slice(c.range.start, c.range.end))
    ).toEqual(['root', 'id[the text]', '(no id)']);
  });

  it('statement spans nest by subtree', () => {
    const src = 'mindmap\n  root\n    a\n    :::x\n      b\n    c\n';
    const show = (s: {
      kind: string;
      range: { start: number; end: number };
      children?: unknown[];
    }): unknown => [
      s.kind,
      src.slice(s.range.start, s.range.end).replace(/\s+/g, ' '),
      ...(s.children ?? []).map((c) => show(c as typeof s)),
    ];
    expect(parseMindmap(src).statements.map(show)).toEqual([
      ['header', 'mindmap'],
      [
        'node',
        'root a :::x b c',
        ['node', 'a :::x b', ['class', ':::x'], ['node', 'b']],
        ['node', 'c'],
      ],
    ]);
  });

  it('follows v12 on blank lines: one after the header, or two runs in a row, reject a node', () => {
    expect(errors('mindmap\n  root\n\n\n    a\n')).toEqual([]);
    expect(errors('mindmap\n')).toEqual([]);
    expect(errors('mindmap\n\n  root\n')).toEqual(['UNEXPECTED']);
    expect(errors('mindmap\n  root\n\n%%\n\n    b\n')).toEqual(['UNEXPECTED']);
    expect(errors('mindmap')).toEqual(['UNEXPECTED']);
  });

  it('rejects what v12 rejects on one line', () => {
    expect(errors('mindmap\n  root\n    a[b] ::icon(x)\n')).toEqual(['UNEXPECTED']);
    expect(errors('mindmap\n  root\n    a[b] c\n')).toEqual(['UNEXPECTED']);
    expect(errors('mindmap\n  root\n    a[]\n')).toEqual(['UNEXPECTED']);
    expect(errors('mindmap\n  root\n    a{b}\n')).toEqual(['UNEXPECTED']);
    expect(errors('mindmap\n  root\n    mindmap\n')).toEqual(['UNEXPECTED']);
  });

  it('names what is left open at the end', () => {
    expect(errors('mindmap\n  root\n    a(b\n')).toEqual(['UNCLOSED_SHAPE']);
    expect(errors('mindmap\n  root\n    a["b\n')).toEqual(['UNCLOSED_STRING']);
    expect(errors('mindmap\n  root\n  ::icon(x\n')).toEqual(['UNCLOSED_ICON']);
  });

  it('is plain, serialisable data', () => {
    const r = parseMindmap('mindmap\n  root\n    a\n    ::icon(x)\n');
    expect(JSON.parse(JSON.stringify(r.model))).toEqual(r.model);
  });
});
