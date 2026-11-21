// D537 (#78): line hops are core's shared edge-path step, for every diagram that draws edges,
// through `createMermaid().render()` and `renderSync()`. The lazy chunk's loading is in
// `line-hops-lazy.spec.ts` and `line-hops-preload.spec.ts`; the precedence is `hopStyle`'s spec in
// core.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';

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

  it('is on by default (D672): the same drawing as `lineHops: true`', async () => {
    const m = createMermaid();
    expect((await m.render('d', withHops())).svg).toBe((await m.render('d', ON)).svg);
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
