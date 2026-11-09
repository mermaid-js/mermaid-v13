// D537 (#78): line hops are core's shared edge-path step, for every diagram that draws edges, in
// a lazily loaded chunk (`@mermaid-js/core/layout/hops`) that `mermaid` loads only for a render
// whose resolved `lineHops` is not `false`. Through `createMermaid().render()` and `renderSync()`;
// the precedence of the shared key and an engine's own key through `hopStyle`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { createMermaid, NotLoadedError } from './index.ts';
import { hopStyle } from './registry.ts';

const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../e2e/diagrams/flowchart/baseline/edges/${name}.mmd`, import.meta.url),
    'utf8'
  );
const ON = fixture('line-hops-on');
const OFF = fixture('line-hops-off');
/** The fixture with `lineHops` set to `value`, or left out. */
const withHops = (value?: string): string =>
  ON.replace(/ {2}lineHops: true\n/, value === undefined ? '' : `  lineHops: ${value}\n`);

/** Every edge line's path data, in document order. */
const lines = (svg: string): string[] =>
  [...svg.matchAll(/<g class="edge[^"]*"[^>]*><path d="([^"]+)"/g)].map((m) => m[1]!);
const ARC = /L[\d.]+,[\d.]+A6,6 0 0,[01] [\d.]+,[\d.]+/g;
/** One hop: the run's points on either side of the arc. */
const HOP = /L([\d.]+),([\d.]+)A6,6 0 0,[01] ([\d.]+),([\d.]+)/g;

function thrown(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
}

describe('lineHops on a flowchart with crossing edges (D537)', () => {
  it('draws a 6px arc on the run that gives way at each crossing, and none when off', async () => {
    const m = createMermaid();
    const on = await m.render('d', ON);
    const off = await m.render('d', OFF);
    expect(on.warnings).toEqual([]);
    assertInert(on.svg);
    const hopped = lines(on.svg);
    const plain = lines(off.svg);
    expect(hopped).toHaveLength(plain.length);
    expect(off.svg).not.toMatch(ARC);
    const changed = hopped.filter((d, i) => d !== plain[i]);
    expect(changed.length).toBeGreaterThan(0);
    for (const d of changed) {
      // Only straight runs are split; every other command, corners included, is kept.
      expect(d.replace(ARC, '')).toBe(plain[hopped.indexOf(d)]);
      for (const hop of d.matchAll(HOP)) {
        const [x1, y1, x2, y2] = hop.slice(1).map(Number) as [number, number, number, number];
        expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(12, 1);
      }
    }
    // Everything but the edge lines is drawn as without hops.
    expect(on.svg.replace(/ d="[^"]+"/g, '')).toBe(off.svg.replace(/ d="[^"]+"/g, ''));
  });

  it('a horizontal run hops over a vertical one', async () => {
    const hopped = lines((await createMermaid().render('d', ON)).svg);
    for (const d of hopped) for (const m of d.matchAll(HOP)) expect(m[2]).toBe(m[4]); // same y on both sides of the arc: a horizontal run
  });

  it('is off by default: the same drawing as `lineHops: false`', async () => {
    const m = createMermaid();
    expect((await m.render('d', withHops())).svg).toBe(
      (await m.render('d', withHops('false'))).svg
    );
  });

  it('`true` and `arc` draw the same; `gap` breaks the line instead', async () => {
    const m = createMermaid();
    const arc = (await m.render('d', withHops('arc'))).svg;
    expect((await m.render('d', ON)).svg).toBe(arc);
    const gap = lines((await m.render('d', withHops('gap'))).svg);
    expect(gap.join(' ')).not.toContain('A6,6');
    expect(gap.some((d) => /L[\d.]+,[\d.]+M[\d.]+,[\d.]+L/.test(d))).toBe(true);
  });

  it('applies through initialize() as well as front matter', async () => {
    const m = createMermaid();
    m.initialize({ lineHops: true });
    expect((await m.render('d', withHops())).svg).toBe((await createMermaid().render('d', ON)).svg);
  });

  it('draws the same hops on the tree writer, under a postRender hook', async () => {
    const stream = (await createMermaid().render('d', ON)).svg;
    const m = createMermaid();
    await m.registerExternalDiagrams([{ id: 'tree-probe', postRender: () => undefined }]);
    expect((await m.render('d', ON)).svg).toBe(stream);
  });

  it('is deterministic, and renderSync after prepare draws the same', async () => {
    const first = await createMermaid().render('d', ON);
    expect((await createMermaid().render('d', ON)).svg).toBe(first.svg);
    const m = createMermaid();
    await m.prepare(ON);
    expect(m.renderSync(ON, { id: 'd' }).svg).toBe(first.svg);
  });
});

describe('the lazy chunk (D537, "Lazy chunk for hops")', () => {
  it('renderSync without it throws NotLoadedError for layout `lineHops`, as for a lazy layout', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    const e = thrown(() => m.renderSync(ON, { id: 'd' }));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'layout', name: 'lineHops' }]);
    // A render that does not hop needs nothing more.
    expect(m.renderSync(OFF, { id: 'd' }).warnings).toEqual([]);
  });

  it('with placeholders, draws without hops and says so', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    const r = m.renderSync(ON, { id: 'd', placeholders: true });
    expect(r.warnings.map((w) => w.code)).toEqual(['PLACEHOLDER']);
    expect(r.warnings[0]!.message).toContain('layout "lineHops"');
    expect(lines(r.svg)).toEqual(lines((await createMermaid().render('d', OFF)).svg));
  });

  it('loads only for a render that hops; preload({ layouts: ["lineHops"] }) loads it', async () => {
    const m = createMermaid();
    await m.render('d', OFF);
    await m.render('c', 'classDiagram\n  A --> B\n');
    expect(() => m.renderSync(ON, { id: 'd' })).toThrow(NotLoadedError);
    await m.preload({ layouts: ['lineHops'] });
    expect(m.renderSync(ON, { id: 'd' }).svg).toBe((await createMermaid().render('d', ON)).svg);
  });

  it('is loaded for every diagram that draws edges, not only flowchart', async () => {
    for (const text of [
      'classDiagram\n  A --> B\n',
      'stateDiagram-v2\n  A --> B\n',
      'erDiagram\n  A ||--o{ B : has\n',
    ]) {
      const hopping = `---\nconfig:\n  lineHops: true\n---\n${text}`;
      const m = createMermaid();
      await m.preload({ types: [m.detectType(text)] });
      const e = thrown(() => m.renderSync(hopping, { id: 'd' }));
      expect((e as NotLoadedError).missing).toEqual([{ kind: 'layout', name: 'lineHops' }]);
      await m.prepare(hopping);
      // No crossing here: drawn exactly as without hops.
      expect(m.renderSync(hopping, { id: 'd' }).svg).toBe(
        (await createMermaid().render('d', text)).svg
      );
    }
  });

  it('`layout: lineHops` is not an engine: LAYOUT_UNKNOWN, drawn with layered', async () => {
    const text = OFF.replace('  lineHops: false\n', '  layout: lineHops\n');
    const r = await createMermaid().render('d', text);
    expect(r.warnings.map((w) => w.code)).toEqual(['LAYOUT_UNKNOWN']);
  });

  it('swimlane hops by default (`swimlane.lineHops: arc`), so its renders load the chunk', async () => {
    const text = '---\nconfig:\n  layout: swimlane\n---\nflowchart LR\n  A --> B\n';
    const m = createMermaid();
    await m.preload({ types: ['flowchart'], layouts: ['swimlane'] });
    const e = thrown(() => m.renderSync(text, { id: 'd' }));
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'layout', name: 'lineHops' }]);
    const off = text.replace('layout: swimlane\n', 'layout: swimlane\n  lineHops: false\n');
    expect(m.renderSync(off, { id: 'd' }).warnings).toEqual([]);
  });
});

describe('hopStyle: the shared key and an engine section (D537)', () => {
  const config = (c: Record<string, unknown>) => c as ResolvedConfig;
  // The resolved config carries every default; `sources` hold only what the author set.
  const elkDefault = { lineHops: false, elk: { lineHops: true } };

  it.each([
    ['nothing set, no engine section', { lineHops: false }, [], 'layered', false],
    ['nothing set, a custom layout', { lineHops: false }, [], undefined, false],
    ['the engine default (elk: true)', elkDefault, [], 'elk.stress', 'arc'],
    ['the engine default (swimlane: arc)', { lineHops: false }, [], 'swimlane', 'arc'],
    ['the shared key set', { lineHops: 'gap' }, [{ lineHops: 'gap' }], 'layered', 'gap'],
    [
      'the shared key over the engine default',
      { ...elkDefault, lineHops: 'gap' },
      [{ lineHops: 'gap' }],
      'elk',
      'gap',
    ],
    [
      'the engine key set over the shared key',
      { lineHops: 'gap', elk: { lineHops: true } },
      [{ lineHops: 'gap' }, { elk: { lineHops: true } }],
      'elk',
      'arc',
    ],
    [
      'the engine key set off',
      { lineHops: true, elk: { lineHops: false } },
      [{ lineHops: true, elk: { lineHops: false } }],
      'elk',
      false,
    ],
    [
      'a shared false set turns hops off everywhere',
      { lineHops: false, elk: { lineHops: true } },
      [{ lineHops: false }, { elk: { lineHops: true } }],
      'elk',
      false,
    ],
    [
      'a shared false set beats the swimlane default',
      { lineHops: false },
      [{ lineHops: false }],
      'swimlane',
      false,
    ],
    [
      'an engine key under another engine is not read',
      { lineHops: false, elk: { lineHops: true } },
      [{ elk: { lineHops: true } }],
      'layered',
      false,
    ],
    [
      'swimlane gap',
      { lineHops: false, swimlane: { lineHops: 'gap' } },
      [{ swimlane: { lineHops: 'gap' } }],
      'swimlane',
      'gap',
    ],
  ] as const)('%s', (_, c, sources, engine, expected) => {
    expect(hopStyle(config(c), sources, engine)).toBe(expected);
  });
});
