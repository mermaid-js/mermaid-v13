import { describe, expect, it } from 'vitest';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { parseClass } from '../index.ts';
import { layoutClass, type ClassLayout, type ClassLayoutContext } from './index.ts';

let theme: Theme | undefined;

/** Lays `src` out with the table measurer (16 px trebuchet: line height 18.576). */
async function lay(src: string, config: Record<string, unknown> = {}): Promise<ClassLayout> {
  theme ??= createTheme(await loadTheme('default'), {});
  const parse = parseClass(src);
  expect(parse.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const ctx: ClassLayoutContext = {
    config: config as ResolvedConfig,
    measurer: tableMeasurer,
    theme,
  };
  return layoutClass(parse.model, ctx);
}

const LINE = 18.576;

describe('class boxes', () => {
  it('stacks the name row, a divider, the attributes and a divider, then the methods', async () => {
    const out = await lay(`classDiagram
class Animal {
  +int age
  +isMammal() bool
}`);
    const box = out.class!.boxes[0]!;
    // 12 px padding (v12's class box) above and below each part.
    expect(box.height).toBeCloseTo(3 * (12 + LINE + 12));
    expect(box.dividers.map((d) => +d.toFixed(3))).toEqual([42.576, 85.152]);
    expect(box.compartments.map((c) => [c.kind, c.rows.length])).toEqual([
      ['attributes', 1],
      ['methods', 1],
    ]);
    expect(box.compartments[1]!.rows[0]!.text).toBe('+isMammal() : bool');
    expect(out.nodes.get(box.layoutId)!.height).toBeCloseTo(box.height);
  });

  it('draws a member-less class with two empty compartments, or none when hideEmptyMembersBox', async () => {
    const shown = (await lay('classDiagram\nclass A')).class!.boxes[0]!;
    expect(shown.compartments.map((c) => [c.kind, c.rows.length, c.height])).toEqual([
      ['attributes', 0, 12],
      ['methods', 0, 12],
    ]);
    expect(shown.height).toBeCloseTo(12 + LINE + 12 + 12 + 12);
    const hidden = (
      await lay('classDiagram\nclass A\nclass B {\n+run()\n}', {
        class: { hideEmptyMembersBox: true },
      })
    ).class!.boxes;
    expect(hidden[0]!.compartments).toEqual([]);
    expect(hidden[0]!.dividers).toEqual([]);
    expect(hidden[0]!.height).toBeCloseTo(12 + LINE + 12);
    // Only a class with no members at all loses its compartments, as in v12.
    expect(hidden[1]!.compartments.map((c) => c.rows.length)).toEqual([0, 1]);
  });

  it('puts the first annotation above the name, and the generic type after it', async () => {
    const box = (
      await lay('classDiagram\nclass Shape~T~ {\n<<interface>>\n<<other>>\n+draw()*\n+count$\n}')
    ).class!.boxes[0]!;
    expect(box.annotation?.text).toBe('«interface»');
    expect(box.name.text).toBe('Shape<T>');
    expect(
      box.name.label.lines
        .flat()
        .map((r) => r.text)
        .join('')
    ).toBe('Shape<T>');
    expect(box.name.y).toBeCloseTo(12 + LINE);
    expect(box.dividers[0]).toBeCloseTo(12 + 2 * LINE + 12);
    const [attr, meth] = box.compartments;
    expect(attr!.rows[0]!.text).toBe('+count');
    expect(attr!.rows[0]!.style).toBe(32); // underline
    expect(meth!.rows[0]!.style).toBe(2); // italic
    expect(attr!.rows[0]!.x).toBe(12);
    expect(box.name.x).toBeCloseTo(box.width / 2);
  });

  it('spaces member rows 3 px apart and honours class.padding', async () => {
    const box = (await lay('classDiagram\nclass A {\n+a\n+b\n}', { class: { padding: 5 } })).class!
      .boxes[0]!;
    const rows = box.compartments[0]!.rows;
    expect(rows[1]!.y - rows[0]!.y).toBeCloseTo(LINE + 3);
    expect(box.compartments[0]!.height).toBeCloseTo(5 + 2 * LINE + 3 + 5);
    expect(box.width).toBeCloseTo(
      Math.max(box.name.label.width, ...rows.map((r) => r.label.width)) + 10
    );
  });
});

describe('class graph', () => {
  it('nests namespaces as groups, or flattens them when hierarchicalNamespaces is off', async () => {
    const src = 'classDiagram\nnamespace A.B {\nclass C\n}\nnamespace D {\nclass E\n}';
    const nested = await lay(src);
    expect(nested.class!.graph.groups.map((g) => [g.id, g.parent])).toEqual([
      ['s:A', undefined],
      ['s:D', undefined],
      ['s:A.B', 's:A'],
    ]);
    expect(nested.class!.groups.map((g) => g.label.lines.flat()[0]!.text)).toEqual(['A', 'D', 'B']);
    const node = nested.class!.graph.nodes.find((n) => n.id === 'c:C')!;
    expect(node.parent).toBe('s:A.B');
    const flat = await lay(src, { class: { hierarchicalNamespaces: false } });
    expect(flat.class!.graph.groups.map((g) => [g.id, g.parent])).toEqual([
      ['s:A.B', undefined],
      ['s:D', undefined],
    ]);
    expect(flat.class!.groups[0]!.label.lines.flat()[0]!.text).toBe('A.B');
    for (const out of [nested, flat]) {
      const g = out.groups.get('s:A.B')!;
      const c = out.nodes.get('c:C')!;
      expect(c.x - c.width / 2).toBeGreaterThanOrEqual(g.x - g.width / 2);
      expect(c.y + c.height / 2).toBeLessThanOrEqual(g.y + g.height / 2);
    }
  });

  it('gives relationships their kind, markers, line, label and multiplicities', async () => {
    const out = await lay(`classDiagram
A "1" *-- "many" B : has
B ..|> C
D ()-- A
note for A "a note"
note "floating"`);
    const edges = out.class!.edges;
    expect(
      edges.map((e) => [e.kind, e.source, e.target, e.line, e.startMarker, e.endMarker])
    ).toEqual([
      ['note', 't:note0', 'c:A', 'dashed', 'none', 'none'],
      ['relation', 'c:A', 'c:B', 'solid', 'composition', 'none'],
      ['relation', 'c:B', 'c:C', 'dashed', 'none', 'extension'],
      ['lollipop', 'i:interface0', 'c:A', 'solid', 'lollipop', 'none'],
    ]);
    const has = edges[1]!;
    const placed = out.edges.get(has.layoutId)!;
    expect(placed.label && placed.startLabel && placed.endLabel).toBeTruthy();
    const ge = out.class!.graph.edges[1]!;
    expect(ge.startLabel).toEqual({ width: has.startLabel!.width, height: has.startLabel!.height });
    expect(ge.endLabel).toEqual({ width: has.endLabel!.width, height: has.endLabel!.height });
    expect(out.class!.notes.map((n) => n.id)).toEqual(['note0', 'note1']);
    expect(out.nodes.has('t:note1')).toBe(true);
    expect(out.nodes.get('i:interface0')).toBeDefined();
  });

  it('keeps an interface in the namespace of its class', async () => {
    const out = await lay('classDiagram\nnamespace N {\nclass A\n}\nI ()-- A');
    expect(out.class!.interfaces[0]!.parent).toBe('s:N');
  });

  it('takes direction, spacing and diagramPadding from the diagram and class config', async () => {
    const out = await lay('classDiagram\ndirection LR\nA --> B', {
      class: { nodeSpacing: 10, rankSpacing: 90, diagramPadding: 30 },
    });
    const g = out.class!.graph;
    expect(g.direction).toBe('LR');
    expect(g.spacing).toMatchObject({ node: 10, rank: 90 });
    expect(g.diagramPadding).toBe(30);
    const a = out.nodes.get('c:A')!;
    const b = out.nodes.get('c:B')!;
    expect(b.x - b.width / 2 - (a.x + a.width / 2)).toBeGreaterThanOrEqual(90);
    expect(a.x - a.width / 2).toBeCloseTo(30);
    const plain = (await lay('classDiagram\nA --> B')).class!.graph;
    expect([plain.direction, plain.spacing.node, plain.spacing.rank, plain.diagramPadding]).toEqual(
      ['TB', 50, 50, 8]
    );
  });
});
