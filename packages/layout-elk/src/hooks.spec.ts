// E4 #242: what the package's own hooks do (`elkExtension`, registered with the loaders), through
// `createMermaid().render()` and `renderSync()`: `lineHops` (D174) and the warnings for what the
// engine could not do as asked (`elk.radial` on a graph that is not a tree; `@{ algorithm }`).
import { describe, expect, it, vi } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from 'mermaid';
import elkLayouts, { elkExtension } from './index.ts';

// ELK puts the two A/B → C/D edges across each other: one horizontal run over one vertical.
const CROSSING = 'flowchart TD\n  A --> C\n  A --> D\n  B --> C\n  B --> D\n';
const doc = (text: string, config = '', layout = 'elk') =>
  `---\nconfig:\n  layout: ${layout}\n${config}---\n${text}`;
const hops = (lineHops: string) => `  elk:\n    lineHops: ${lineHops}\n`;

function api() {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  m.registerLayoutLoaders(elkLayouts);
  return m;
}

/** Every edge line's path data, in document order. */
const lines = (svg: string): string[] =>
  [...svg.matchAll(/<g class="edge[^"]*"[^>]*><path d="([^"]+)"/g)].map((m) => m[1]!);

describe('elk.lineHops (a postRender edit, D174)', () => {
  it('draws an arc where one edge crosses another, by default', async () => {
    const plain = lines((await api().render('d', doc(CROSSING, hops('false')))).svg);
    const hopped = lines((await api().render('d', doc(CROSSING))).svg);
    expect(hopped).toHaveLength(plain.length);
    const changed = hopped.filter((d, i) => d !== plain[i]);
    expect(changed).toHaveLength(1);
    // One straight run split around the crossing by a 6px arc; every other command kept.
    const arc = /L([\d.]+),([\d.]+)A6,6 0 0,[01] ([\d.]+),([\d.]+)L/.exec(changed[0]!);
    expect(arc).not.toBeNull();
    const [x1, y1, x2, y2] = arc!.slice(1).map(Number) as [number, number, number, number];
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(12, 1);
    expect(changed[0]!.replace(/L[\d.]+,[\d.]+A6,6 0 0,[01] [\d.]+,[\d.]+/, '')).toBe(
      plain[hopped.indexOf(changed[0]!)]
    );
  });

  it('`true` and `arc` draw the same, `gap` breaks the line instead', async () => {
    const byDefault = (await api().render('d', doc(CROSSING))).svg;
    expect((await api().render('d', doc(CROSSING, hops('arc')))).svg).toBe(byDefault);
    expect((await api().render('d', doc(CROSSING, hops('true')))).svg).toBe(byDefault);
    const gap = lines((await api().render('d', doc(CROSSING, hops('gap')))).svg);
    expect(gap.join(' ')).not.toContain('A6,6');
    expect(gap.some((d) => /L[\d.]+,[\d.]+M[\d.]+,[\d.]+L/.test(d))).toBe(true);
  });

  it('leaves a drawing with no crossing exactly as drawn', async () => {
    const tree = 'flowchart TD\n  A --> B\n  A --> C\n';
    expect((await api().render('d', doc(tree))).svg).toBe(
      (await api().render('d', doc(tree, hops('false')))).svg
    );
  });

  it('runs its hooks only on renders laid out with ELK', async () => {
    const postLayout = vi.spyOn(elkExtension, 'postLayout');
    const postRender = vi.spyOn(elkExtension, 'postRender');
    try {
      const m = api();
      await m.render('d', CROSSING);
      await m.render('d', doc(CROSSING, '', 'layered'));
      await m.render('d', 'sequenceDiagram\n  A->>B: hi\n');
      expect(postLayout).not.toHaveBeenCalled();
      expect(postRender).not.toHaveBeenCalled();
      await m.render('d', doc(CROSSING));
      expect(postLayout).toHaveBeenCalledTimes(1);
      expect(postRender).toHaveBeenCalledTimes(1);
    } finally {
      postLayout.mockRestore();
      postRender.mockRestore();
    }
  });

  it('never touches a drawing that is not laid out with ELK', async () => {
    const plain = await createMermaid().render('d', CROSSING);
    expect((await api().render('d', CROSSING)).svg).toBe(
      (await createMermaid().render('d', CROSSING)).svg
    );
    expect((await api().render('d', doc(CROSSING, '', 'layered'))).svg).toBe(
      (await createMermaid().render('d', doc(CROSSING, '', 'layered'))).svg
    );
    expect(plain.svg).not.toContain('A6,6');
  });

  it('stays inert and deterministic, and renderSync after prepare draws the same', async () => {
    const text = doc(CROSSING);
    const first = await api().render('d', text);
    assertInert(first.svg);
    expect((await api().render('d', text)).svg).toBe(first.svg);
    const m = api();
    await m.prepare(text);
    expect(m.renderSync(text, { id: 'd' }).svg).toBe(first.svg);
  });
});

describe('what the engine could not do as asked', () => {
  // A cycle: ELK says "The given graph is not a tree!".
  const forest = 'flowchart TD\n  A --> B\n  B --> A\n';

  it('elk.radial on a graph that is not a tree draws with layered and warns once', async () => {
    const r = await api().render('d', doc(forest, '', 'elk.radial'));
    expect(r.warnings.map((w) => w.code)).toEqual(['ELK_RADIAL_NOT_A_TREE']);
    expect(r.warnings[0]!.message).toMatch(/layered/);
    // Drawn as the built-in engine draws it.
    const layered = await createMermaid().render('d', doc(forest, '', 'layered'));
    expect(r.svg.replace(/elk\.radial/g, '')).toBe(layered.svg.replace(/layered/g, ''));
    // Once per render, and again on the next render of the same text.
    const m = api();
    for (let i = 0; i < 2; i++)
      expect((await m.render('d', doc(forest, '', 'elk.radial'))).warnings).toHaveLength(1);
  });

  it('elk.radial on a tree warns nothing', async () => {
    const r = await api().render(
      'd',
      doc('flowchart TD\n  A --> B\n  A --> C\n', '', 'elk.radial')
    );
    expect(r.warnings).toEqual([]);
  });

  it('a group’s @{ algorithm } is parsed but not applied: one ELK_ALGORITHM_IGNORED (D174)', async () => {
    const text = doc(
      'flowchart TD\n  subgraph g1\n    a --> b\n  end\n  subgraph g2\n    c --> d\n  end\n  g1@{ algorithm: elk.box }\n  g2@{ algorithm: elk.box }\n  x --> g1\n'
    );
    const r = await api().render('d', text);
    expect(r.warnings.map((w) => w.code)).toEqual(['ELK_ALGORITHM_IGNORED']);
    expect(r.warnings[0]!.message).toContain('elk.box');
    // Laid out as if the groups named nothing.
    const without = await api().render(
      'd',
      text.replace(/ {2}g[12]@\{ algorithm: elk.box \}\n/g, '')
    );
    expect(without.warnings).toEqual([]);
    expect(r.svg).toBe(without.svg);
  });
});
