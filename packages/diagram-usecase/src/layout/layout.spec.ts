import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { validateLayout, type LayoutGraph } from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { parseUsecase } from '../parser/index.ts';
import { layoutUsecase, type UsecaseLayout, type UsecaseLayoutContext } from './layout.ts';

let theme: Theme | undefined;

interface Laid {
  out: UsecaseLayout;
  graph: LayoutGraph;
  warnings: string[];
}

/** Parses `src` and lays it out with the table measurer through `layered`. */
async function lay(src: string, usecase: Record<string, unknown> = {}): Promise<Laid> {
  theme ??= createTheme(await loadTheme('default'));
  const parse = parseUsecase(src);
  expect(parse.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const warnings: string[] = [];
  const ctx: UsecaseLayoutContext = {
    config: { usecase } as unknown as ResolvedConfig,
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

  it('measures a plain label’s markup as text, as v12 escaped it, and a Markdown label’s HTML', async () => {
    const { out } = await lay('usecase-beta\nA("a<br>b & <b>c</b>")\nB("`a<br>**b**`")');
    const a = out.usecase!.nodes.get('usecase:A')!;
    const b = out.usecase!.nodes.get('usecase:B')!;
    if (a.kind !== 'usecase' || b.kind !== 'usecase') throw new Error('kind');
    expect(text(a.label)).toEqual(['a<br>b & <b>c</b>']);
    expect(text(b.label)).toEqual(['a', 'b']);
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
