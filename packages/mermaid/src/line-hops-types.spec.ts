// #655: line hops (D537) in class, block, C4 and architecture, the types whose crossing runs
// drew no hop. Each type's `pr-check/line-hops.mmd` (#655's samples) turns them on; flowchart's
// own cases are in `line-hops.spec.ts`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';

const fixture = (dir: string): string =>
  readFileSync(
    new URL(`../../../e2e/diagrams/${dir}/pr-check/line-hops.mmd`, import.meta.url),
    'utf8'
  );
/** `text` with its `lineHops: true` set to `value`, or left out. */
const withHops = (text: string, value?: string): string =>
  text.replace(/ {2}lineHops: true\n/, value === undefined ? '' : `  lineHops: ${value}\n`);

/** The path data of every `<path>`, in document order. */
const paths = (svg: string): string[] =>
  [...svg.matchAll(/<path [^>]*?\bd="([^"]+)"/g)].map((m) => m[1]!);
const ARC = /A6,6 0 0,[01] /;

/** Each type, its fixture folder, and the class or tag its edge lines carry. */
const TYPES = [
  { type: 'class', dir: 'class-diagram', line: /<g class="edge relation[^"]*"[^>]*><path d="/ },
  { type: 'block', dir: 'block', line: /<path class="edge-thickness-[^"]*flowchart-link"/ },
  { type: 'c4', dir: 'c4', line: /<path class="c4-rel c4-rel-rel"/ },
  { type: 'architecture', dir: 'architecture', line: /<path class="edge"/ },
] as const;

describe.each(TYPES)('lineHops in $type (#655, D537)', ({ dir, line }) => {
  const ON = fixture(dir);

  it('hops the run that gives way at a crossing; off, it draws as before', async () => {
    const m = createMermaid();
    const on = await m.render('d', ON);
    const off = await m.render('d', withHops(ON, 'false'));
    expect(on.warnings).toEqual([]);
    assertInert(on.svg);
    expect(on.svg).toMatch(line);
    expect(off.svg).not.toMatch(ARC);
    const hopped = paths(on.svg);
    const plain = paths(off.svg);
    expect(hopped).toHaveLength(plain.length);
    const changed = hopped.filter((d, i) => d !== plain[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatch(ARC);
    // Only the hopped run's data changes: everything else is drawn as without hops.
    expect(on.svg.replace(/ d="[^"]+"/g, '')).toBe(off.svg.replace(/ d="[^"]+"/g, ''));
  });

  it('is on by default (D672), and `gap` breaks the run instead of bumping it', async () => {
    const m = createMermaid();
    const unset = (await m.render('d', withHops(ON))).svg;
    expect(unset).toBe((await m.render('d', ON)).svg);
    const gap = (await m.render('d', withHops(ON, 'gap'))).svg;
    expect(gap).not.toBe(unset);
    expect(gap).not.toMatch(ARC);
    expect(paths(gap).some((d) => /L[\d.-]+,[\d.-]+M[\d.-]+,[\d.-]+L/.test(d))).toBe(true);
  });
});

describe("lineHops in #655's class sample (#793, D650)", () => {
  // A to C's horizontal run crosses B to D and B to F, whose runs leave B 5px apart: too close
  // for a hop each, so the two share one merged hop, as tall as a plain hop and wider. Without
  // B to F, the crossing hops plainly (the class fixture above).
  const SAMPLE = readFileSync(
    new URL(
      '../../../e2e/diagrams/class-diagram/nightly-check/line-hops-close-crossings.mmd',
      import.meta.url
    ),
    'utf8'
  );

  it('draws one merged hop over two crossings 5px apart, and only that', async () => {
    const m = createMermaid();
    const on = await m.render('d', SAMPLE);
    const off = await m.render('d', withHops(SAMPLE, 'false'));
    expect(on.warnings).toEqual([]);
    assertInert(on.svg);
    const hopped = paths(on.svg);
    const plain = paths(off.svg);
    const changed = hopped.filter((d, i) => d !== plain[i]);
    expect(changed).toHaveLength(1);
    // Corners are 5px arcs; the hop is the one arc as tall as a hop, and wider than one.
    const hops = [...changed[0]!.matchAll(/A([\d.]+),6 0 0,[01] /g)];
    expect(hops).toHaveLength(1);
    expect(Number(hops[0]![1])).toBeGreaterThan(8);
    expect(on.svg.replace(/ d="[^"]+"/g, '')).toBe(off.svg.replace(/ d="[^"]+"/g, ''));
  });
});
