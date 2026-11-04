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

  it('sizes compartments as v12: 1.5 P each with no members, 2 P when only one is empty', async () => {
    const out = await lay(`classDiagram
class A
class B {
  +int x
}
class C {
  +run()
}`);
    const [a, b, c] = out.class!.boxes;
    const parts = (box: typeof a) => box!.compartments.map((k) => [k.rows.length, k.height]);
    // No members: label + 5 P (header P + label + P, then 1.5 P twice).
    expect(a!.height).toBeCloseTo(LINE + 5 * 12);
    expect(parts(a)).toEqual([
      [0, 18],
      [0, 18],
    ]);
    // Attributes only: the empty methods compartment is 2 P.
    expect(b!.height).toBeCloseTo(2 * LINE + 6 * 12);
    expect(parts(b)[1]).toEqual([0, 24]);
    // Methods only: the empty attributes compartment is 2 P, and the methods start 1.5 P down.
    expect(c!.height).toBeCloseTo(2 * LINE + 6.5 * 12);
    expect(parts(c)[0]).toEqual([0, 24]);
    const methods = c!.compartments[1]!;
    expect(methods.rows[0]!.y - methods.top).toBeCloseTo(18);
    expect(methods.height).toBeCloseTo(18 + LINE + 12);
  });

  it('drops both compartments of a member-less class when hideEmptyMembersBox', async () => {
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

  it('reads member and name text as markdown, as v12 did', async () => {
    const box = (
      await lay(
        'classDiagram\nclass A {\n__boldmethod__()\n_italicmethod_()\n+a<br>b\n+List~T~ items\n}'
      )
    ).class!.boxes[0]!;
    const [attrs, methods] = box.compartments;
    const runs = (r: { label: { lines: { text: string; style: number }[][] } }) =>
      r.label.lines.map((l) => l.map((x) => [x.text, x.style]));
    expect(runs(methods!.rows[0]!)).toEqual([
      [
        ['boldmethod', 1],
        ['()', 0],
      ],
    ]);
    expect(runs(methods!.rows[1]!)).toEqual([
      [
        ['italicmethod', 2],
        ['()', 0],
      ],
    ]);
    expect(runs(attrs!.rows[0]!)).toEqual([[['+a', 0]], [['b', 0]]]);
    expect(attrs!.rows[1]!.y - attrs!.rows[0]!.y).toBeCloseTo(2 * LINE + 3);
    // A generic is text, not a tag.
    expect(runs(attrs!.rows[1]!)).toEqual([[['+List<T> items', 0]]]);
  });

  it('keeps a line for a blank name', async () => {
    const box = (await lay('classDiagram\nclass A[" "]')).class!.boxes[0]!;
    expect(box.dividers[0]).toBeCloseTo(12 + LINE + 12);
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

  it('joins a lollipop to its interface, even beside a class named like it', async () => {
    const out = await lay('classDiagram\nclass interface0\nfoo ()-- B');
    const edges = out.class!.edges.map((e) => [e.kind, e.source, e.target]);
    expect(edges).toEqual([['lollipop', 'i:interface0', 'c:B']]);
    expect(out.class!.interfaces[0]!.label.lines.flat()[0]!.text).toBe('foo');
  });

  it('pads namespaces with class.padding, 16 by default', async () => {
    const src = 'classDiagram\nnamespace N {\nclass A\n}';
    expect((await lay(src)).class!.graph.groups[0]!.padding).toEqual({
      top: 16,
      right: 16,
      bottom: 16,
      left: 16,
    });
    const padded = (await lay(src, { class: { padding: 5 } })).class!.graph.groups[0]!;
    expect(padded.padding).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
  });

  it('routes and draws edges with flowchart.curve, rounded right angles by default', async () => {
    const src = 'classDiagram\nA --> B';
    const plain = (await lay(src)).class!;
    expect([plain.curve, plain.graph.routing]).toEqual(['rounded', 'stepped']);
    const linear = (await lay(src, { flowchart: { curve: 'linear' } })).class!;
    expect([linear.curve, linear.graph.routing]).toEqual(['linear', 'straight']);
    const basis = (await lay(src, { flowchart: { curve: 'basis' } })).class!;
    expect([basis.curve, basis.graph.routing]).toEqual(['curved', 'curved']);
    const step = (await lay(src, { flowchart: { curve: 'stepAfter' } })).class!;
    expect([step.curve, step.graph.routing]).toEqual(['stepAfter', 'stepped']);
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
