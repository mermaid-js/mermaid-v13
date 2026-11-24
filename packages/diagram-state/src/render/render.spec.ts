import { describe, expect, it } from 'vitest';
import type { SvgNode, SvgTree } from '@mermaid-js/core/svg';
import { renderForTest } from '../testing.fixtures.ts';

const root = (tree: SvgTree): SvgNode => tree.find({ tag: 'svg' })[0]!;
const textIn = (tree: SvgTree, node: SvgNode): string =>
  tree
    .children(node)
    .map((c) => tree.textOf(c) ?? textIn(tree, c))
    .join('');

describe('state render: document root (DESIGN §7.2)', () => {
  it('writes the root with viewBox, max-width, role and the v12 group classes', async () => {
    const { svg, tree } = await renderForTest('stateDiagram-v2\n  [*] --> A\n  A --> B : go');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    const r = root(tree);
    expect(tree.getAttr(r, 'role')).toBe('img');
    expect(tree.getAttr(r, 'aria-roledescription')).toBe('stateDiagram');
    expect(tree.getAttr(r, 'class')).toBe('mermaid mermaid-state statediagram');
    expect(tree.getAttr(r, 'data-mermaid-version')).toBe('13.0.0-alpha.0');
    expect(tree.getAttr(r, 'width')).toBe('100%');
    expect(tree.getAttr(r, 'viewBox')).toMatch(/^0 0 \d+ \d+$/);
    expect(tree.getAttr(r, 'style')).toMatch(/^max-width:\d+px;--_/);
    const groups = tree.children(r).map((n) => tree.getAttr(n, 'class'));
    expect(groups).toEqual(['clusters', 'edgePaths', 'edgeLabels', 'nodes']);
  });

  it('writes width and height instead of max-width when useMaxWidth is off', async () => {
    const { tree } = await renderForTest('stateDiagram-v2\n  A --> B', {
      config: { state: { useMaxWidth: false } },
    });
    const r = root(tree);
    const [, , w, h] = tree.getAttr(r, 'viewBox')!.split(' ');
    expect(tree.getAttr(r, 'width')).toBe(w);
    expect(tree.getAttr(r, 'height')).toBe(h);
    expect(tree.getAttr(r, 'style')).not.toMatch(/max-width/);
  });

  it('labels the root from accTitle and accDescr with the only ids', async () => {
    const { svg, tree } = await renderForTest(
      'stateDiagram-v2\n  accTitle: Machine\n  accDescr: How it runs\n  A --> B',
      { idPrefix: 'd1' }
    );
    const r = root(tree);
    expect(tree.getAttr(r, 'aria-labelledby')).toBe('d1-title');
    expect(tree.getAttr(r, 'aria-describedby')).toBe('d1-desc');
    expect(textIn(tree, tree.find({ tag: 'title' })[0]!)).toBe('Machine');
    expect(textIn(tree, tree.find({ tag: 'desc' })[0]!)).toBe('How it runs');
    expect([...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1])).toEqual(['d1-title', 'd1-desc']);
  });

  it('declares every theme alias the body uses on the root', async () => {
    const { svg } = await renderForTest(
      'stateDiagram-v2\n  state C {\n    [*] --> A\n    --\n    [*] --> B\n  }\n  A --> D : x\n  note right of D : n\n  D --> [*]\n  state F <<fork>>\n  state Q <<choice>>'
    );
    const style = /<svg[^>]* style="([^"]*)"/.exec(svg)![1]!;
    const declared = new Set([...style.matchAll(/(--_[\w-]+):/g)].map((m) => m[1]));
    const used = new Set([...svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(5);
    for (const name of used) expect(declared, name).toContain(name);
  });
});

const byAst = (tree: SvgTree, id: string): SvgNode[] =>
  tree.find((n, t) => t.getAttr(n, 'data-ast') === id);
const one = (tree: SvgTree, id: string): SvgNode => {
  const found = byAst(tree, id);
  expect(found, id).toHaveLength(1);
  return found[0]!;
};
const tags = (tree: SvgTree, node: SvgNode): string[] =>
  tree.children(node).map((c) => tree.tag(c) ?? '#text');
const classOf = (tree: SvgTree, node: SvgNode): string | undefined => tree.getAttr(node, 'class');

describe('state render: states and pseudo-states', () => {
  it('draws each kind of state with its v12 shape and classes', async () => {
    const { tree } = await renderForTest(
      [
        'stateDiagram-v2',
        '  [*] --> A',
        '  A --> B',
        '  B : first',
        '  B : second',
        '  state F <<fork>>',
        '  state J <<join>>',
        '  state Q <<choice>>',
        '  A --> F',
        '  F --> J',
        '  J --> Q',
        '  Q --> [*]',
      ].join('\n')
    );
    const a = one(tree, 'n:A');
    expect(classOf(tree, a)).toBe('node statediagram-state');
    expect(tree.getAttr(a, 'data-id')).toBe('A');
    expect(tags(tree, a)).toEqual(['rect', 'text']);
    expect(tree.getAttr(tree.children(a)[0]!, 'rx')).toBe('5');

    const b = one(tree, 'n:B');
    expect(tags(tree, b)).toEqual(['rect', 'text', 'line', 'text']);
    expect(classOf(tree, tree.children(b)[2]!)).toBe('divider');
    // v12 stateDb: the first description is the title, the rest are the rows; the id is not drawn.
    const [, title, , rows] = tree.children(b);
    expect(textIn(tree, title!)).toBe('first');
    expect(textIn(tree, rows!)).toBe('second');

    const start = one(tree, 'n:[*]start');
    expect(classOf(tree, start)).toBe('node default');
    expect(tree.getAttr(start, 'data-id')).toBe('root_start');
    expect(classOf(tree, tree.children(start)[0]!)).toBe('state-start');

    const end = byAst(tree, 'n:[*]end')[0] ?? one(tree, 'n:Q/[*]end');
    expect(tags(tree, end)).toEqual(['circle', 'circle']);
    expect(tree.children(end).map((c) => classOf(tree, c))).toEqual([
      'state-end',
      'end-state-inner',
    ]);

    for (const id of ['n:F', 'n:J']) {
      const bar = one(tree, id);
      expect(classOf(tree, tree.children(bar)[0]!)).toBe('fork-join');
    }
    expect(tags(tree, one(tree, 'n:Q'))).toEqual(['polygon']);
  });

  it('titles an aliased state with its display name and puts its description below', async () => {
    const { tree } = await renderForTest(
      'stateDiagram-v2\n  state "Some long name" as S1\n  S1 : a description\n  [*] --> S1'
    );
    const s1 = one(tree, 'n:S1');
    expect(tags(tree, s1)).toEqual(['rect', 'text', 'line', 'text']);
    const [, title, , rows] = tree.children(s1);
    expect(textIn(tree, title!)).toBe('Some long name');
    expect(textIn(tree, rows!)).toBe('a description');
  });

  it('applies classDef classes and styles to a state, and its text colour to the label', async () => {
    const { tree } = await renderForTest(
      'stateDiagram-v2\n  classDef hot fill:#ff0000,color:#00ff00\n  A:::hot --> B\n  style B stroke:#0000ff'
    );
    const a = one(tree, 'n:A');
    expect(classOf(tree, a)).toBe('node statediagram-state hot');
    const [rect, text] = tree.children(a);
    expect(tree.getAttr(rect!, 'fill')).toBe('#ff0000');
    expect(tree.getAttr(text!, 'fill')).toBe('#00ff00');
    expect(tree.getAttr(tree.children(one(tree, 'n:B'))[0]!, 'stroke')).toBe('#0000ff');
  });
});

describe('state render: transitions and notes', () => {
  it('draws a transition as a path with an inline point arrowhead and a label', async () => {
    const { tree } = await renderForTest('stateDiagram-v2\n  A --> B : go');
    const edge = tree.find((n, t) => t.getAttr(n, 'data-id') === 'edge0' && t.tag(n) === 'g');
    expect(edge).toHaveLength(2);
    const [path, label] = edge;
    expect(tree.getAttr(path!, 'data-ast')).toBeDefined();
    expect(classOf(tree, path!)).toBe('transition edge-thickness-normal edge-pattern-solid');
    expect(tags(tree, path!)).toEqual(['path', 'path']);
    expect(classOf(tree, tree.children(path!)[1]!)).toBe('marker');
    expect(classOf(tree, label!)).toBe('edgeLabel');
    expect(tree.getAttr(label!, 'data-ast')).toBeUndefined();
    expect(textIn(tree, label!)).toBe('go');
  });

  it('draws a note as a node, joined by a dashed connector with no arrowhead', async () => {
    const { tree } = await renderForTest(
      'stateDiagram-v2\n  A --> B\n  note right of A\n    a note\n  end note'
    );
    const note = one(tree, 'note:1');
    expect(classOf(tree, note)).toBe('node statediagram-note');
    expect(textIn(tree, note)).toBe('a note');
    const conn = tree.find((n, t) => (t.getAttr(n, 'class') ?? '').includes('note-edge'));
    expect(conn).toHaveLength(1);
    expect(tree.getAttr(conn[0]!, 'data-ast')).toBeUndefined();
    expect(tags(tree, conn[0]!)).toEqual(['path']);
    expect(tree.getAttr(tree.children(conn[0]!)[0]!, 'stroke-dasharray')).toBe('5');
    // Transitions stay solid.
    const solid = tree.find((n, t) => (t.getAttr(n, 'class') ?? '').includes('pattern-solid'));
    expect(solid).toHaveLength(1);
    expect(tree.getAttr(tree.children(solid[0]!)[0]!, 'stroke-dasharray')).toBeUndefined();
  });
});

describe('state render: composites and concurrency regions', () => {
  it('draws a composite as outer and inner rects with its title, alternating nested bodies', async () => {
    const { tree } = await renderForTest(
      'stateDiagram-v2\n  state Outer {\n    [*] --> Inner\n    state Inner {\n      [*] --> X\n    }\n  }'
    );
    const outer = one(tree, 's:Outer');
    expect(classOf(tree, outer)).toBe('statediagram-state statediagram-cluster');
    expect(tree.children(outer).map((c) => classOf(tree, c))).toEqual([
      'outer',
      'inner',
      'cluster-label',
    ]);
    expect(textIn(tree, outer)).toBe('Outer');
    const inner = one(tree, 's:Inner');
    expect(classOf(tree, inner)).toBe(
      'statediagram-state statediagram-cluster statediagram-cluster-alt'
    );
    const body = (g: SvgNode) => tree.getAttr(tree.children(g)[1]!, 'fill');
    expect(body(outer)).not.toBe(body(inner));
  });

  it('draws regions and dashed dividers from the layout, one fewer divider than regions', async () => {
    const { tree, layout } = await renderForTest(
      'stateDiagram-v2\n  state Active {\n    [*] --> A\n    --\n    [*] --> B\n    --\n    [*] --> C\n  }'
    );
    const active = one(tree, 's:Active');
    const lines = tree.children(active).filter((c) => classOf(tree, c) === 'divider');
    expect(lines).toHaveLength(2);
    expect(layout.dividers).toHaveLength(2);
    for (const [i, line] of lines.entries()) {
      const d = layout.dividers[i]!;
      expect(tree.getAttr(line, 'stroke-dasharray')).toBe('10 10');
      expect(Number(tree.getAttr(line, 'x1'))).toBeCloseTo(d.x1, 1);
      expect(Number(tree.getAttr(line, 'y2'))).toBeCloseTo(d.y2, 1);
    }
    // The regions and dividers start below the composite's title band.
    const title = layout.groups.get('Active')!.title;
    const label = layout.state.views.get('Active')!.label;
    for (const d of layout.dividers) expect(d.y1).toBeGreaterThan(title.y + label.height / 2);
    for (const k of [1, 2, 3]) {
      const frame = layout.groups.get(`Active:region${k}`)!;
      expect(frame.y - frame.height / 2).toBeGreaterThan(title.y + label.height / 2);
    }
    for (const k of [1, 2, 3]) {
      const region = one(tree, `r:Active#${k}`);
      expect(tree.getAttr(region, 'data-id')).toBe(`Active:region${k}`);
      expect(classOf(tree, region)).toContain('statediagram-cluster');
    }
  });
});

describe('state render: palette slots (v12 stateDiagram-colorIndex)', () => {
  const slot = (tree: SvgTree, ast: string) => tree.getAttr(one(tree, ast), 'data-color-id');

  it('gives each composite its own slot in order, and none to plain states', async () => {
    const { tree } = await renderForTest(
      'stateDiagram-v2\n  [*] --> Boot\n  state Boot {\n    [*] --> Firmware\n    state Kernel {\n      [*] --> Scheduler\n      state Drivers {\n        [*] --> Probe\n      }\n    }\n  }\n  Boot --> Running\n  state Running {\n    [*] --> Serving\n  }'
    );
    expect(slot(tree, 's:Boot')).toBe('color-0');
    expect(slot(tree, 's:Kernel')).toBe('color-1');
    expect(slot(tree, 's:Drivers')).toBe('color-2');
    expect(slot(tree, 's:Running')).toBe('color-3');
    expect(slot(tree, 'n:Firmware')).toBeUndefined();
  });

  it("shares a composite's slot with its regions, and leaves later composites unshifted", async () => {
    const { tree } = await renderForTest(
      'stateDiagram-v2\n  state First {\n    [*] --> A\n    --\n    [*] --> C\n  }\n  state Second {\n    [*] --> B\n  }'
    );
    expect(slot(tree, 's:First')).toBe('color-0');
    expect(slot(tree, 'r:First#1')).toBe('color-0');
    expect(slot(tree, 'r:First#2')).toBe('color-0');
    expect(slot(tree, 's:Second')).toBe('color-1');
  });

  it('leaves a styled composite and its regions unpainted, but spends its slot', async () => {
    const { tree } = await renderForTest(
      'stateDiagram-v2\n  classDef pinned fill:#111827,stroke:#F59E0B\n  state First {\n    [*] --> A\n  }\n  state Second {\n    [*] --> B\n    --\n    [*] --> D\n  }\n  state Third {\n    [*] --> C\n  }\n  class Second pinned'
    );
    expect(slot(tree, 's:First')).toBe('color-0');
    expect(slot(tree, 's:Second')).toBeUndefined();
    expect(slot(tree, 'r:Second#1')).toBeUndefined();
    expect(slot(tree, 's:Third')).toBe('color-2');
  });

  it('paints a composite whose style was dropped as a misspelt colour (#1195)', async () => {
    const composites =
      '  state First {\n    [*] --> A\n  }\n  state Second {\n    [*] --> B\n    --\n    [*] --> D\n  }';
    for (const styling of [
      '  classDef bad fill:redd\n  class Second bad',
      '  style Second fill:redd',
    ]) {
      const { tree } = await renderForTest(`stateDiagram-v2\n${composites}\n${styling}`);
      expect(slot(tree, 's:Second'), styling).toBe('color-1');
      expect(slot(tree, 'r:Second#1'), styling).toBe('color-1');
    }
  });

  it('paints no slot in a theme without a palette, whatever its name', async () => {
    const plain = await renderForTest('stateDiagram-v2\n  state S {\n    [*] --> A\n  }', {
      config: { theme: 'redux' },
    });
    expect(slot(plain.tree, 's:S')).toBeUndefined();
    const given = await renderForTest('stateDiagram-v2\n  state S {\n    [*] --> A\n  }', {
      config: { theme: 'default', themeVariables: { borderColorArray: ['#ff0000'] } },
    });
    expect(slot(given.tree, 's:S')).toBe('color-0');
    expect(tree0(given.tree, 's:S')).toBe('#ff0000');
  });

  const tree0 = (tree: SvgTree, ast: string) =>
    tree.getAttr(tree.children(one(tree, ast))[0]!, 'stroke');
});

describe('state render: composite theme variables (D120, D126, #193)', () => {
  // The title band reads `compositeTitleBackground`, a top-level composite's body
  // `compositeBackground` and a nested one's `altBackground`.
  const src = 'stateDiagram-v2\n  state Outer {\n    state Inner {\n      [*] --> A\n    }\n  }';
  it('paints the title band and the alternate body from their own variables', async () => {
    const { tree, svg } = await renderForTest(src, {
      config: {
        theme: 'default',
        themeVariables: { compositeTitleBackground: '#123456', altBackground: '#abcdef' },
      },
    });
    const fills = (ast: string) =>
      tree
        .children(one(tree, ast))
        .slice(0, 2)
        .map((n) => tree.getAttr(n, 'fill'));
    // Each fill is the root's custom property for that variable (D152).
    const prop = (fill = '') => /^var\((--_\w+)\)$/.exec(fill)?.[1];
    const [title, body] = fills('s:Outer').map(prop);
    const [innerTitle, alt] = fills('s:Inner').map(prop);
    const declared = (p: string | undefined) =>
      new RegExp(`${p}:var\\(--mermaid-(\\w+),`).exec(svg)?.[1];
    expect([title, innerTitle].map(declared)).toEqual([
      'compositeTitleBackground',
      'compositeTitleBackground',
    ]);
    expect(declared(body)).toBe('compositeBackground');
    expect(declared(alt)).toBe('altBackground');
    expect(svg).toContain('--mermaid-compositeTitleBackground,#123456)');
    expect(svg).toContain('--mermaid-altBackground,#abcdef)');
  });
});

describe('state render: theme geometry (D152)', () => {
  it('writes the drop shadow only where the theme has one', async () => {
    const src = 'stateDiagram-v2\n  A --> B';
    const redux = await renderForTest(src, { config: { theme: 'redux' } });
    const classic = await renderForTest(src, { config: { theme: 'default' } });
    expect(redux.svg).toMatch(/filter="var\(--_ds\)"/);
    expect(classic.svg).not.toMatch(/filter=/);
  });

  it('rounds composites with the theme radius', async () => {
    const src = 'stateDiagram-v2\n  state S {\n    [*] --> A\n  }';
    const rx = async (theme: string) => {
      const { tree } = await renderForTest(src, { config: { theme } });
      return tree.getAttr(tree.children(one(tree, 's:S'))[0]!, 'rx');
    };
    expect(await rx('redux')).toBe('12');
    expect(await rx('default')).toBe('5');
  });
});

describe('state render: links', () => {
  it('wraps a clicked state in a checked link with its tooltip, and drops unsafe ones', async () => {
    const { tree, warnings } = await renderForTest(
      'stateDiagram-v2\n  A --> B\n  click A "https://example.com" "Go there"\n  click B href "javascript:alert(1)"'
    );
    const a = one(tree, 'n:A');
    expect(tags(tree, a)).toEqual(['title', 'a']);
    const link = tree.children(a)[1]!;
    expect(tree.getAttr(link, 'href')).toBe('https://example.com');
    expect(tree.getAttr(link, 'target')).toBe('_blank');
    expect(tags(tree, one(tree, 'n:B'))).toEqual(['rect', 'text']);
    expect(warnings.map((w) => w.code)).toContain('URL_REFUSED');
  });
});
