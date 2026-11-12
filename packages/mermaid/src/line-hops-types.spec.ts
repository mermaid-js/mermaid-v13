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

  it('is off by default, and `gap` breaks the run instead of bumping it', async () => {
    const m = createMermaid();
    const unset = (await m.render('d', withHops(ON))).svg;
    expect(unset).toBe((await m.render('d', withHops(ON, 'false'))).svg);
    const gap = (await m.render('d', withHops(ON, 'gap'))).svg;
    expect(gap).not.toBe(unset);
    expect(gap).not.toMatch(ARC);
    expect(paths(gap).some((d) => /L[\d.-]+,[\d.-]+M[\d.-]+,[\d.-]+L/.test(d))).toBe(true);
  });
});

describe("lineHops in #655's class sample", () => {
  // A to C's horizontal run crosses B to D and B to F, whose runs leave B 5px apart: too close
  // for two hops, so neither is drawn (D537, the rule `hopPaths` keeps from v12). Without B to F,
  // the crossing hops (the class fixture above).
  const SAMPLE = `---
config:
  lineHops: true
---
classDiagram
 A --> D
 B --> C
 A --> C
 B --> D
 E --> C
 A --> F
 B --> F`;

  it('draws no hop where two crossings on one run are 5px apart', async () => {
    const m = createMermaid();
    const on = (await m.render('d', SAMPLE)).svg;
    expect(on).not.toMatch(ARC);
    expect(on).toBe((await m.render('d', withHops(SAMPLE, 'false'))).svg);
  });
});
