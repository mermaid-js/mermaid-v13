import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertInert, type PathData } from '@mermaid-js/core/svg';
import type { InlineProvider } from '@mermaid-js/core/text';
import { createMermaid, MermaidError, type ExtensionPlugin } from './index.ts';

const CORPUS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));

function mmd(dir: string): { id: string; source: string }[] {
  const out: { id: string; source: string }[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.mmd'))
        out.push({ id: p.slice(CORPUS.length), source: readFileSync(p, 'utf8') });
    }
  };
  walk(join(CORPUS, dir));
  return out;
}

/**
 * The fixture provider: `$$…$$` becomes a box 4 px wide per TeX character, 30 px tall with its
 * baseline 20 px down, drawn as a frame and a path (what a math engine emits).
 */
const fixture: InlineProvider = {
  open: '$$',
  close: '$$',
  box: (tex) => {
    const width = 4 * tex.length;
    return {
      width,
      height: 30,
      baseline: 20,
      node: {
        tag: 'g',
        children: [
          { tag: 'rect', attrs: { width, height: 30, fill: 'none' } },
          { tag: 'path', attrs: { d: `M0,20L${width},20` as PathData } },
        ],
      },
    };
  },
};
const math: ExtensionPlugin = { id: 'fixture-math', inline: [fixture] };

function api(...extensions: ExtensionPlugin[]) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return { m, ready: m.registerExternalDiagrams(extensions) };
}

const codes = (warnings: readonly { code: string }[]): string[] => warnings.map((w) => w.code);
const RE_BOX = /<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)"><g><rect width="([\d.]+)"/g;
/** Each drawn box: its top-left corner and width. */
const boxes = (svg: string): { x: number; y: number; width: number }[] =>
  [...svg.matchAll(RE_BOX)].map((m) => ({ x: +m[1]!, y: +m[2]!, width: +m[3]! }));
/** The baselines (`y`) of every positioned tspan. */
const baselines = (svg: string): number[] =>
  [...svg.matchAll(/<tspan x="-?[\d.]+" y="(-?[\d.]+)"/g)].map((m) => +m[1]!);

/** How many lines these baselines make (equal within 0.01 px). */
const lines = (ys: number[]): number =>
  ys.sort((a, b) => a - b).filter((y, i, all) => i === 0 || y - all[i - 1]! > 0.01).length;

const FLOW = 'flowchart LR\n  A["From $$x(t)$$ to $$y(t)$$"] --> B("$$z$$")';

describe('$$…$$ without a provider (D176)', () => {
  it('shows the TeX as written, with one MATH_NOT_RENDERED per render', async () => {
    const { m } = api();
    for (let i = 0; i < 2; i++) {
      const r = await m.render('x', FLOW);
      expect(codes(r.warnings)).toEqual(['MATH_NOT_RENDERED']);
      expect(r.svg).toContain('From $$x(t)$$ to');
    }
    expect(codes(m.renderSync(FLOW).warnings)).toEqual(['MATH_NOT_RENDERED']);
    expect(codes((await m.render('x', 'flowchart LR\n  A["costs $$5"]')).warnings)).toEqual([]);
  });

  it('names the feature, not a package (D153)', async () => {
    const [w] = (await api().m.render('x', FLOW)).warnings;
    expect(w?.message).toMatch(/math/i);
    expect(w?.message).not.toMatch(/@mermaid-js|plugin/);
  });
});

describe('inline boxes from an extension (D177)', () => {
  it('draws each box as its node, on the baseline of the text beside it', async () => {
    const { m, ready } = api(math);
    await ready;
    const r = await m.render('x', FLOW);
    expect(codes(r.warnings)).toEqual([]);
    const drawn = boxes(r.svg);
    expect(drawn.map((b) => b.width)).toEqual([4 * 'x(t)'.length, 4 * 'y(t)'.length, 4]);
    const [first, second, alone] = drawn as [
      (typeof drawn)[0],
      (typeof drawn)[0],
      (typeof drawn)[0],
    ];
    // A's line: "From " [box] " to " [box], one baseline.
    const [y] = baselines(r.svg);
    expect(first.y + 20).toBeCloseTo(y!, 1);
    expect(second.y).toBe(first.y);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    // B holds only the box: it is the line, centred on the node.
    expect(alone).toMatchObject({ x: -2, y: -15 });
    expect(r.svg).not.toContain('$$');
  });

  it('wraps a box as one piece at several widths', async () => {
    const label = 'flowchart LR\n  A["aaaa $$wxyz$$ aaaa"]';
    const rows: number[] = [];
    for (const wrappingWidth of [200, 60, 30, 5]) {
      const m = createMermaid();
      m.initialize({ deterministic: true, flowchart: { wrappingWidth } });
      await m.registerExternalDiagrams([math]);
      const { svg } = await m.render('x', label);
      expect(
        boxes(svg).map((b) => b.width),
        String(wrappingWidth)
      ).toEqual([16]);
      rows.push(lines([...baselines(svg), ...boxes(svg).map((b) => b.y + 20)]));
    }
    // One line; the box stays with the word before it; 'aaaa' splits at characters and the box
    // follows the 'a' left over; narrower than the box, every character takes a line and the box
    // one more, whole.
    expect(rows).toEqual([1, 2, 4, 9]);
  });

  it('passes the allow-list and stays deterministic over the math and flowchart corpus (R-SEC-2)', async () => {
    const { m, ready } = api(math);
    await ready;
    // A postRender hook switches the writer to its tree backing, which must agree byte for byte.
    const { m: tree, ready: treeReady } = api(math, { id: 'tree', postRender: () => {} });
    await treeReady;
    let drawn = 0;
    for (const { id, source } of [...mmd('katex'), ...mmd('flowchart')]) {
      let svg: string;
      try {
        svg = (await m.render('mermaid-0', source)).svg;
      } catch (e) {
        if (e instanceof MermaidError) continue;
        throw e;
      }
      if (boxes(svg).length > 0) drawn++;
      const auto = svg.includes('<style>');
      expect(() => assertInert(svg, { themeStyle: auto }), id).not.toThrow();
      expect((await tree.render('mermaid-0', source)).svg, id).toBe(svg);
    }
    expect(drawn).toBeGreaterThanOrEqual(4);
  });

  it('checks the whole fragment and blames the extension for a malformed child', async () => {
    for (const child of [
      null,
      { attrs: {} },
      { tag: 'script' },
      { tag: 'g', attrs: { onclick: 'x' } },
    ]) {
      const bad: ExtensionPlugin = {
        id: 'bad-fragment',
        inline: [
          {
            open: '$$',
            close: '$$',
            box: () =>
              ({
                width: 1,
                height: 1,
                baseline: 1,
                node: { tag: 'g', children: [child] },
              }) as never,
          },
        ],
      };
      const { m, ready } = api(bad);
      await ready;
      const e = await m.render('x', FLOW).catch((x: unknown) => x);
      expect(e, JSON.stringify(child)).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).message).toMatch(/"bad-fragment" failed in inline/);
    }
  });

  it('reports a failing provider as the extension that failed', async () => {
    const broken: ExtensionPlugin = {
      id: 'broken-math',
      inline: [
        {
          open: '$$',
          close: '$$',
          box: () => ({ width: NaN, height: 1, baseline: 1, node: { tag: 'g' } }),
        },
      ],
    };
    const { m, ready } = api(broken);
    await ready;
    const e = await m.render('x', FLOW).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('INTERNAL');
    expect((e as MermaidError).message).toMatch(/"broken-math" failed in inline: .*finite width/);
  });
});

// Every label core lays out, per type (D176): one `$$…$$` span each, with a distinct TeX length
// so each box can be told apart (4 px per character).
const EVERY_TYPE: readonly { type: string; source: string; spans: readonly string[] }[] = [
  {
    type: 'flowchart',
    source: [
      'flowchart LR',
      '  subgraph S["$$s_1$$"]',
      '    A["$$a$$"] -- "$$e_{12}$$" --> B',
      '  end',
    ].join('\n'),
    spans: ['s_1', 'a', 'e_{12}'],
  },
  {
    type: 'class',
    source: [
      'classDiagram',
      '  class A["$$a$$"] {',
      // Not at the end: a member ending in `$` is static (v12).
      '    +$$m_1$$ x',
      '  }',
      '  A "$$n_{12}$$" --> "1" B : $$f_{123}$$',
      '  note for A "$$t_{1234}$$"',
    ].join('\n'),
    spans: ['a', 'm_1', 'n_{12}', 'f_{123}', 't_{1234}'],
  },
  {
    type: 'state',
    source: [
      'stateDiagram-v2',
      '  state "$$c$$" as C {',
      '    s1 : $$d_1$$',
      '  }',
      '  C --> s2 : $$e_{12}$$',
      '  note right of s2 : $$n_{123}$$',
    ].join('\n'),
    spans: ['c', 'd_1', 'e_{12}', 'n_{123}'],
  },
  {
    type: 'er',
    source: [
      'erDiagram',
      '  A["$$a$$"] {',
      '    string name "$$k_{12}$$"',
      '  }',
      '  A ||--o{ B : "$$r_1$$"',
    ].join('\n'),
    spans: ['a', 'r_1', 'k_{12}'],
  },
  {
    type: 'sequence',
    source: [
      'sequenceDiagram',
      '  participant A as $$a$$',
      '  loop $$l_1$$',
      '    A->>B: $$m_{12}$$',
      '  end',
      '  Note over A: $$n_{123}$$',
    ].join('\n'),
    spans: ['a', 'l_1', 'm_{12}', 'n_{123}'],
  },
];

describe('math in every diagram type (D176)', () => {
  it.each(EVERY_TYPE)('$type: draws a box for every label span', async ({ source, spans }) => {
    const { m, ready } = api(math);
    await ready;
    const r = await m.render('x', source);
    expect(codes(r.warnings)).toEqual([]);
    // Every fixture box, whatever the label's own attributes on its group.
    const widths = [...r.svg.matchAll(/<rect width="([\d.]+)" height="30" fill="none"/g)].map(
      (b) => +b[1]!
    );
    for (const tex of spans) expect(widths, tex).toContain(4 * tex.length);
    expect(r.svg).not.toContain('$$');
    expect(r.svg).not.toMatch(/[﷐-﷯]/);
  });

  it.each(EVERY_TYPE)(
    '$type: without a provider shows the TeX, with one MATH_NOT_RENDERED',
    async ({ type, source, spans }) => {
      const r = await api().m.render('x', source);
      // Sequence keeps its own code for one alpha, as a deprecated alias.
      const alias = type === 'sequence' ? ['SEQUENCE_MATH'] : [];
      expect(codes(r.warnings)).toEqual(['MATH_NOT_RENDERED', ...alias]);
      for (const tex of spans) expect(r.svg).toContain(`$$${tex}$$`);
    }
  );

  // D179: text output draws no boxes, provider or not, and says so once.
  it.each(EVERY_TYPE.filter((t) => ['flowchart', 'er', 'sequence'].includes(t.type)))(
    '$type: text output shows the TeX as written, with one ASCII_DROPPED for math',
    async ({ type, source }) => {
      for (const extensions of [[], [math]]) {
        const { m, ready } = api(...extensions);
        await ready;
        const r = await m.render('x', source, { format: 'ascii' });
        expect(r.text).toContain('$$a$$');
        const dropped = r.warnings.filter((w) => w.code === 'ASCII_DROPPED');
        expect(dropped.filter((w) => w.feature === 'math')).toHaveLength(1);
        const others = codes(r.warnings).filter((c) => c !== 'ASCII_DROPPED');
        expect(others).toEqual(type === 'sequence' ? ['SEQUENCE_MATH'] : []);
      }
    }
  );
});
