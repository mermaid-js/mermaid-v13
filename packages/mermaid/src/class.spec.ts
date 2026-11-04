import { describe, expect, it } from 'vitest';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { assertInert } from '@mermaid-js/core/svg';
import { classDiagram } from '@mermaid-js/diagram-class';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

// Class is a first-party type (#157): both v12 keywords go to `@mermaid-js/diagram-class`
// through the generated registry, by v12's one `classDiagram` detector (D101).
const BODY = '  class Animal {\n    +name\n    +eat()\n  }\n  Animal <|-- Duck : is a\n';
const V1 = `classDiagram\n${BODY}`;
const V2 = `classDiagram-v2\n${BODY}`;
const NS = 'classDiagram\n  namespace Zoo {\n    class Duck\n  }\n';
const classConf = (yaml: string, text: string) =>
  `---\nconfig:\n  class:\n    ${yaml}\n---\n${text}`;

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

/** The first `<rect>` after the opening tag `open` matches. */
function rectAfter(svg: string, open: RegExp): { x: number; y: number; h: number } {
  const at = svg.search(open);
  expect(at, String(open)).toBeGreaterThanOrEqual(0);
  const rect = /<rect([^>]*)>/.exec(svg.slice(at))![1]!;
  const n = (k: string) => Number(new RegExp(`\\b${k}="([-\\d.]+)"`).exec(rect)?.[1] ?? 0);
  return { x: n('x'), y: n('y'), h: n('height') };
}

describe('class diagrams through the public API (#157)', () => {
  it.each([
    ['classDiagram', V1],
    ['classDiagram-v2', V2],
  ])('renders the %s keyword', async (_keyword, text) => {
    const result = await createMermaid().render('c1', text);
    expect(result.diagramType).toBe('classDiagram');
    expect(result.svg).toContain('aria-roledescription="classDiagram"');
    expect(result.svg).toContain('class="mermaid mermaid-class"');
    expect(result.svg).toContain('is a');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it('draws both keywords alike (one renderer, D101)', async () => {
    const m = createMermaid();
    expect((await m.render('c', V2)).svg).toBe((await m.render('c', V1)).svg);
  });

  it('gives every element its raw data-id; only data-ast is escaped (R-PARSE-8)', async () => {
    const text =
      'classDiagram\nclass `B#2` {\n  +x\n}\nclass `C@x`\n`B#2` --> `C@x`\nnote for `B#2` "n"\n';
    const { svg } = await createMermaid().render('c', text);
    const tags = (re: RegExp) => svg.match(re) ?? [];
    expect(tags(/<g class="node default"[^>]*data-id="B#2" data-ast="n:B%232"/g)).toHaveLength(1);
    expect(
      tags(/<text class="member attribute" data-id="B#2#1" data-ast="m:B%232#1"/g)
    ).toHaveLength(1);
    expect(
      tags(/<g class="edge relation[^"]*" data-id="id_B#2_C@x_1" data-ast="e:B%232&gt;C%40x"/g)
    ).toHaveLength(1);
    expect(tags(/<g class="node note" data-id="note0"/g)).toHaveLength(1);
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(V2);
    expect(m.renderSync(V2).svg).toContain('mermaid-class');
  });

  it('reports a syntax error as a positioned MermaidError', async () => {
    const e = await rejection(createMermaid().render('c', 'classDiagram\n  class A\n  A <|-- \n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBeGreaterThan(1);
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D100)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('classDiagram', 'svg')).toBe(true);
    expect(m.supportsFormat('class', 'svg')).toBe(true);
    expect(m.supportsFormat('class', 'ascii')).toBe(false);
    const e = await rejection(m.render('c', V1, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('classDiagram');
  });

  it('reads the class section: useMaxWidth, rankSpacing, hideEmptyMembersBox', async () => {
    const m = createMermaid();
    const plain = await m.render('c', V1);
    expect(plain.svg).toMatch(/<svg[^>]* width="100%"/);
    expect((await m.render('c', classConf('useMaxWidth: false', V1))).svg).toMatch(
      /<svg[^>]* width="\d/
    );
    expect((await m.render('c', classConf('rankSpacing: 200', V1))).height).toBeGreaterThan(
      plain.height
    );
    const empty = 'classDiagram\n  class A\n';
    const hidden = await m.render('c', classConf('hideEmptyMembersBox: true', empty));
    expect(hidden.height).toBeLessThan((await m.render('c', empty)).height);
  });

  it('pads as v12 drew when nothing is set: boxes 12, namespaces 16 (D125)', async () => {
    const m = createMermaid();
    const box = (svg: string) => rectAfter(svg, /<g class="node default[^"]*" data-id="Duck"/);
    const ns = (svg: string) => rectAfter(svg, /<g class="cluster namespace"/);
    // A bare class box is its name plus 5 × the box padding (v12 classBox, #155).
    const bare = 'classDiagram\n  class Duck\n';
    const h = async (text: string) => box((await m.render('c', text)).svg).h;
    expect((await h(classConf('padding: 20', bare))) - (await h(bare))).toBeCloseTo(40, 5);
    expect(await h(classConf('padding: 12', bare))).toBeCloseTo(await h(bare), 5);
    // The namespace border sits `padding` from its class; unset, 16 (v12 `padding ?? 16`).
    const gap = async (text: string) => {
      const svg = (await m.render('c', text)).svg;
      const at = /<g class="node default[^"]*" data-id="Duck"[^>]*translate\(([-\d.]+)/.exec(svg);
      return Number(at![1]) - ns(svg).x;
    };
    const twelve = await gap(classConf('padding: 12', NS));
    expect((await gap(classConf('padding: 20', NS))) - twelve).toBeCloseTo(8, 5);
    expect((await gap(NS)) - twelve).toBeCloseTo(4, 5);
  });

  it('defaults to layered even with an ELK plugin registered (D127, R-LAYOUT-7)', async () => {
    let calls = 0;
    const elk: LayoutEngine = (graph, ctx) => {
      calls++;
      return layered(graph, ctx);
    };
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'elk', loader: () => Promise.resolve(elk) }]);
    await m.render('c', V1);
    expect(calls).toBe(0);
    await m.render('c', classConf('layout: elk', V1));
    expect(calls).toBe(1);
  });

  it('renders through mermaid/slim with the class plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [classDiagram] });
    expect((await slim.render('c', V1)).svg).toBe((await createMermaid().render('c', V1)).svg);
  });
});
