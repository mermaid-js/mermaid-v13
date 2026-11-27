import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { validateLayout, type LayoutGraph } from '@mermaid-js/core/layout';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { parseUsecase } from '../parser/index.ts';
import { usecaseLayoutProblems } from './invariants.ts';
import { layoutUsecase, type UsecaseLayout, type UsecaseLayoutContext } from './layout.ts';

let theme: Theme | undefined;

interface Laid {
  out: UsecaseLayout;
  graph: LayoutGraph;
  warnings: string[];
}

/** Parses `src` and lays it out with the table measurer through `layered`. */
async function lay(
  src: string,
  usecase: Record<string, unknown> = {},
  top: Record<string, unknown> = {}
): Promise<Laid> {
  theme ??= createTheme(await loadTheme('default'));
  const parse = parseUsecase(src);
  expect(parse.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const warnings: string[] = [];
  const ctx: UsecaseLayoutContext = {
    config: { ...top, usecase } as unknown as ResolvedConfig,
    measurer: tableMeasurer,
    theme,
    warn: (w) => warnings.push(w.code),
  };
  const out = layoutUsecase(parse.model, ctx);
  return { out, graph: out.usecase!.graph, warnings };
}

describe('the usecase graph', () => {
  it('lays an actor and a use case out validly, one node each and one edge', async () => {
    const { out, graph } = await lay('usecase-beta\nactor User\nUser --> Login');
    expect(graph.nodes.map((n) => n.id)).toEqual(['actor:User', 'usecase:Login']);
    expect(graph.edges.map((e) => [e.source, e.target])).toEqual([['actor:User', 'usecase:Login']]);
    expect(validateLayout(graph, out)).toEqual([]);
  });
});

// Table measurer line heights: 12px 13.932, 14px 16.254, 16px 18.576.
describe('node sizes (v12 getData and shapes)', () => {
  it('sizes an actor as the 56 × 72 glyph, an 8px gap and its label, padded 10, with no least width', async () => {
    const { out } = await lay('usecase-beta\nactor User');
    const v = out.usecase!.nodes.get('actor:User')!;
    expect(v.width).toBe(76);
    expect(v.height).toBeCloseTo(10 + 72 + 8 + 16.254 + 10);
  });

  it('puts an actor stereotype between the glyph and the name, 2px above the name', async () => {
    const { out } = await lay('usecase-beta\nactor User <<Staff>>');
    const v = out.usecase!.nodes.get('actor:User')!;
    if (v.kind !== 'actor') throw new Error(v.kind);
    expect([v.glyphTop, v.stereotypeTop, v.labelTop]).toEqual([10, 90, 90 + 16.254 + 2]);
    expect(v.height).toBeCloseTo(90 + 2 * 16.254 + 2 + 10);
  });

  it('makes an oval use case the label block, at least minNodeWidth wide, plus 20 each side', async () => {
    const { out } = await lay('usecase-beta\nLogin');
    const v = out.usecase!.nodes.get('usecase:Login')!;
    expect(v.width).toBe(120 + 40);
    expect(v.height).toBeCloseTo(13.932 + 40);
  });

  it('wraps a use case label at wrappingWidth and reads minNodeWidth', async () => {
    const long = 'Place an order with every item in the cart';
    const { out } = await lay(`usecase-beta\nU("${long}")`, { minNodeWidth: 60 });
    const v = out.usecase!.nodes.get('usecase:U')!;
    if (v.kind !== 'usecase') throw new Error(v.kind);
    expect(v.label.lines.length).toBeGreaterThan(1);
    expect(v.label.width).toBeLessThanOrEqual(120);
    const short = (await lay('usecase-beta\nA', { minNodeWidth: 60 })).out.usecase!.nodes;
    expect(short.get('usecase:A')!.width).toBe(60 + 40);
  });

  it('pads a [rect] use case with the node padding, 16 across and 12 down', async () => {
    const { out } = await lay('usecase-beta\nManage[Manage]');
    const v = out.usecase!.nodes.get('usecase:Manage')!;
    expect([v.width, v.height]).toEqual([120 + 32, 13.932 + 24]);
  });

  it('folds an oval stereotype over its label, and keeps a business one 2px above', async () => {
    const plain = (await lay('usecase-beta\nA("A") <<s>>')).out.usecase!.nodes.get('usecase:A')!;
    expect(plain.height).toBeCloseTo(2 * 13.932 + 40);
    const business = (await lay('usecase-beta\nA("A")@{ business: true } <<s>>')).out.usecase!
      .nodes;
    expect(business.get('usecase:A')!.height).toBeCloseTo(2 * 13.932 + 2 + 40);
  });

  it('sizes a note in the theme font, at least minNodeWidth wide, padded 10', async () => {
    const { out } = await lay('usecase-beta\nA\nnote for A "hi"');
    const v = out.usecase!.nodes.get('note:1')!;
    expect([v.width, v.height]).toEqual([140, 18.576 + 20]);
  });

  it('stacks a JSON table: the title row, then a row per key, cells padded 8 × 4, in a 1px border', async () => {
    const { out } = await lay('usecase-beta\njson P@{ "a": 1, "b": 2 }');
    const v = out.usecase!.nodes.get('json:P')!;
    if (v.kind !== 'json') throw new Error(v.kind);
    expect(v.rows.map((r) => r.row.key)).toEqual(['a', 'b']);
    const row = 18.576 + 8;
    expect(v.height).toBeCloseTo(1 + 3 * row + 1);
    expect(v.width).toBe(1 + 120 + 16 + 1);
    expect(v.keyWidth + v.valueWidth).toBe(136);
  });
});

describe('boundaries, notes and edges', () => {
  it('makes a boundary a group of its members, padded 20, with its title', async () => {
    const { graph, out } = await lay(
      'usecase-beta\nactor C\nsystemBoundary S["Shop"]\n  Browse\nend\nC --> Browse'
    );
    expect(graph.nodes.find((n) => n.id === 'usecase:Browse')!.parent).toBe('boundary:S');
    expect(graph.nodes.find((n) => n.id === 'actor:C')!.parent).toBeUndefined();
    const g = graph.groups[0]!;
    expect(g.padding).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
    expect(g.title!.height).toBeCloseTo(18.576);
    expect(validateLayout(graph, out)).toEqual([]);
  });

  it('gives a package boundary its tab: the title plus 10 high, plus 20 and at least 80 wide', async () => {
    const { out, graph } = await lay(
      'usecase-beta\nsystemBoundary S["A"]@{ type: package }\n  Browse\nend'
    );
    const tab = out.usecase!.boundaries[0]!.tab!;
    expect(tab.width).toBe(80);
    expect(tab.height).toBeCloseTo(18.576 + 10);
    expect(graph.groups[0]!.title).toEqual(tab);
  });

  it('joins a note to its target through a dotted internal edge one rank long', async () => {
    const { graph, out } = await lay('usecase-beta\nA\nnote for A "hi"');
    expect(graph.edges).toEqual([
      { id: 'note:1-edge', source: 'note:1', target: 'usecase:A', minLen: 1 },
    ]);
    const e = out.usecase!.edges[0]!;
    expect([e.kind, e.dotted, 'label' in e]).toEqual(['note', true, false]);
  });

  it('puts a note on a boundary member beside it when another member sits in the rank before', async () => {
    const { out } = await lay(
      'usecase-beta\nsystemBoundary S\n  A\n  B\nend\nactor C\nC --> A\nB ..> : extend A\nnote for A "n"'
    );
    expect(usecaseLayoutProblems(out)).toEqual([]);
    // The note's line runs from A on to the note, past the boundary's far side.
    const e = out.usecase!.edges.find((v) => v.kind === 'note')!;
    expect([e.source, e.target]).toEqual(['usecase:A', 'note:1']);
    expect(out.usecase!.graph.edges.find((g) => g.id === e.id)).toMatchObject({
      source: 'usecase:A',
      target: 'note:1',
    });
  });

  it('keeps a note before its target when it is beside it there', async () => {
    const { out } = await lay(
      'usecase-beta\nsystemBoundary S\n  A\n  B\nend\nactor C\nC --> B\nB ..> : extend A\nnote for B "n"'
    );
    expect(usecaseLayoutProblems(out)).toEqual([]);
    const e = out.usecase!.edges.find((v) => v.kind === 'note')!;
    expect([e.source, e.target]).toEqual(['note:1', 'usecase:B']);
  });

  it('takes minLen from the dash count and labels include and extend', async () => {
    const { graph, out } = await lay(
      'usecase-beta\nactor U\nU ----> A\nA ..> : include B\nB ..> : extend C'
    );
    expect(graph.edges.map((e) => e.minLen)).toEqual([3, 1, 1]);
    const labels = out.usecase!.edges.map((e) =>
      (e.kind === 'relation' ? e.label : undefined)?.lines
        .flat()
        .map((r) => r.text)
        .join('')
    );
    expect(labels).toEqual([undefined, '«include»', '«extend»']);
    expect(out.usecase!.edges.map((e) => e.dotted)).toEqual([false, true, true]);
  });

  it('takes spacing from nodeSpacing and rankSpacing, and the margin from diagramPadding', async () => {
    const { graph } = await lay('usecase-beta\nA', {
      nodeSpacing: 70,
      rankSpacing: '90',
      diagramPadding: 5,
    });
    expect(graph.spacing).toMatchObject({ node: 70, rank: 90 });
    expect(graph.diagramPadding).toBe(5);
  });

  it('warns once per config value it cannot use and draws with the default', async () => {
    const { graph, warnings } = await lay('usecase-beta\nA', {
      nodeSpacing: '50px',
      rankSpacing: -1,
      actorFontWeight: 'heavy',
    });
    expect(graph.spacing).toMatchObject({ node: 50, rank: 50 });
    expect(warnings).toEqual([
      'USECASE_CONFIG_IGNORED',
      'USECASE_CONFIG_IGNORED',
      'USECASE_CONFIG_IGNORED',
    ]);
  });

  it('measures actor and use case labels in their own fonts', async () => {
    const { out } = await lay('usecase-beta\nactor U\nA', {
      actorFontSize: 20,
      usecaseFontSize: 16,
      usecaseFontWeight: 'bold',
    });
    const u = out.usecase!.nodes.get('actor:U')!;
    const a = out.usecase!.nodes.get('usecase:A')!;
    if (u.kind !== 'actor' || a.kind !== 'usecase') throw new Error('kinds');
    expect([u.font.size, a.font.size, a.font.weight]).toEqual([20, 16, 700]);
    expect(a.height).toBeCloseTo(18.576 + 40);
  });
});

describe('edge ends on ovals', () => {
  it('ends every edge on an oval on the oval, not its box', async () => {
    const { out } = await lay(
      'usecase-beta\ndirection TB\nactor U\nU --> A\nU --> B\nU --> C\nA --> B'
    );
    for (const [id, edge] of out.edges) {
      for (const [p, node] of [
        [edge.points[0]!, out.usecase!.edges.find((e) => e.id === id)!.source],
        [edge.points.at(-1)!, out.usecase!.edges.find((e) => e.id === id)!.target],
      ] as const) {
        if (!node.startsWith('usecase:')) continue;
        const n = out.nodes.get(node)!;
        const level = ((p.x - n.x) / (n.width / 2)) ** 2 + ((p.y - n.y) / (n.height / 2)) ** 2;
        expect(level, `${id} at ${node}`).toBeCloseTo(1, 6);
      }
    }
  });
});

describe('plain and Markdown labels', () => {
  const text = (l: { lines: { text: string }[][] }) =>
    l.lines.map((r) => r.map((x) => x.text).join(''));

  /** Each line of a label as `[text, style bits]` runs. */
  const runs = (l: { lines: { text: string; style: number }[][] }) =>
    l.lines.map((r) => r.map((x) => [x.text, x.style]));

  /** The measured label of every actor, use case, note, boundary and edge, by model id. */
  async function labels(src: string, config: Record<string, unknown> = {}) {
    const { out } = await lay(src, {}, config);
    const p = out.usecase!;
    const by = new Map<string, MeasuredLabel>();
    for (const v of p.nodes.values()) {
      if (v.kind === 'actor') by.set(v.actor.id, v.label);
      if (v.kind === 'usecase') by.set(v.useCase.id, v.label);
      if (v.kind === 'note') by.set(v.note.id, v.label);
    }
    for (const b of p.boundaries) by.set(b.boundary.id, b.label);
    for (const e of p.edges) if (e.kind === 'relation' && e.label) by.set(e.id, e.label);
    return by;
  }

  // Every label kind, each way it can be written (D735, spec #1368).
  const KINDS = [
    'systemBoundary B["boundary <b>b</b>"]\n  actor A("actor <b>b</b>")\n  U("usecase <b>b</b>")\n  S[square <b>b</b>]\nend',
    'A -- "edge <b>b</b>" --> U',
    'note for U "note <b>b</b>"',
  ];
  const every = (body: string) => `usecase-beta\n${KINDS.join('\n')}\n${body}`;

  it('draws the tags of a plain label in every label kind, and decodes its entities (D735)', async () => {
    const by = await labels(every(''));
    const bold = (kind: string) => [
      [
        [`${kind} `, 0],
        ['b', Style.Bold],
      ],
    ];
    expect(runs(by.get('A')!)).toEqual(bold('actor'));
    expect(runs(by.get('U')!)).toEqual(bold('usecase'));
    expect(runs(by.get('S')!)).toEqual(bold('square'));
    expect(runs(by.get('note-0')!)).toEqual(bold('note'));
    expect(runs(by.get('B')!)).toEqual(bold('boundary'));
    expect(runs([...by.values()].at(-1)!)).toEqual(bold('edge'));
    const a = (await labels('usecase-beta\nA("a<br>b &amp; &lt;b&gt;c&lt;/b&gt;")')).get('A')!;
    expect(text(a)).toEqual(['a', 'b & <b>c</b>']);
  });

  it('reads markdown only in a markdown string, and breaks at a written \\n in both', async () => {
    const by = await labels(
      'usecase-beta\nP("**p** _i_")\nQ("`**q** _i_`")\nR(`**r**`)\nC("a `c` b")\nN("one\\ntwo")\nM("`**m**\\ntwo`")'
    );
    expect(runs(by.get('P')!)).toEqual([[['**p** _i_', 0]]]);
    expect(runs(by.get('Q')!)).toEqual([
      [
        ['q', Style.Bold],
        [' ', 0],
        ['i', Style.Italic],
      ],
    ]);
    // Bare backticks are no markdown string (D733): drawn as written.
    expect(text(by.get('R')!)).toEqual(['`**r**`']);
    expect(text(by.get('C')!)).toEqual(['a `c` b']);
    expect(text(by.get('N')!)).toEqual(['one', 'two']);
    expect(runs(by.get('M')!)).toEqual([[['m', Style.Bold]], [['two', 0]]]);
  });

  it('draws every label the same with legacyMarkdown: no usecase label kind read v12 markdown', async () => {
    const src = every(
      'P("**p** _i_")\nQ("`**q**`")\nR(`**r**`)\nN("one\\ntwo")\nP -- "**e**" --> Q'
    );
    const plain = await labels(src);
    const legacy = await labels(src, { legacyMarkdown: true });
    expect([...legacy.keys()]).toEqual([...plain.keys()]);
    for (const [id, label] of plain) expect(runs(legacy.get(id)!), id).toEqual(runs(label));
  });

  it('keeps stereotypes, include and extend and JSON cells as written', async () => {
    const { out } = await lay(
      'usecase-beta\nactor A <<s<b>b</b>&amp;>>\nU\nV\nU ..> : include V\njson J@{ "<b>k</b>": "<i>v</i> &amp;" }'
    );
    const p = out.usecase!;
    const actor = p.nodes.get('actor:A')!;
    const json = [...p.nodes.values()].find((v) => v.kind === 'json');
    if (actor.kind !== 'actor' || !json) throw new Error('kind');
    expect(text(actor.stereotype!)).toEqual(['«s<b>b</b>&amp;»']);
    expect(text(json.rows[0]!.key)).toEqual(['<b>k</b>']);
    expect(text(json.rows[0]!.value)).toEqual(['<i>v</i> &amp;']);
    const edge = p.edges.find((e) => e.kind === 'relation');
    expect(edge && text(edge.label!)).toEqual(['«include»']);
  });
});

describe('styled labels', () => {
  it('measures a label in its style font-size and weight, and the view keeps that font', async () => {
    const { out, warnings } = await lay(
      'usecase-beta\nA\nclassDef big font-size:16px,font-weight:bold\nclass A big'
    );
    const v = out.usecase!.nodes.get('usecase:A')!;
    expect([v.font.size, v.font.weight]).toEqual([16, 700]);
    expect(v.height).toBeCloseTo(18.576 + 40);
    expect(warnings).toEqual([]);
  });

  it('warns once per font-size it cannot measure, and measures at the own size', async () => {
    const { out, warnings } = await lay(
      'usecase-beta\nA\nB\nstyle A font-size:10vw\nstyle B font-size:10vw'
    );
    expect(warnings).toEqual(['USECASE_STYLE_IGNORED']);
    const v = out.usecase!.nodes.get('usecase:A')!;
    expect(v.font.size).toBe(12);
    expect(v.height).toBeCloseTo(13.932 + 40);
  });
});
