// D537 (#78): event modeling relations go through core's shared edge-path step
// (`outline('edge', 'path', …)`), so the shared `lineHops` key hops one relation over another
// where they cross, and the default (`false`) draws them as before.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';

const SOURCE = readFileSync(
  new URL(
    '../../../e2e/diagrams/eventmodeling/nightly-check/layout-line-hops.mmd',
    import.meta.url
  ),
  'utf8'
);

/** Every relation's path data, in document order. */
const relations = (svg: string): string[] =>
  [...svg.matchAll(/<path class="em-relation"[^>]* d="([^"]+)"/g)].map((m) => m[1]!);
const ARC = /A6,6 0 0,[01] /g;

async function render(lineHops?: boolean | 'arc' | 'gap'): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...(lineHops === undefined ? {} : { lineHops }) } as never);
  const r = await m.render('hops', SOURCE);
  expect(r.warnings).toEqual([]);
  return r.svg;
}

describe('lineHops on event modeling relations (D537)', () => {
  it('hops by default (D672), and draws no hop with lineHops: false', async () => {
    const plain = await render(false);
    expect(relations(plain)).toHaveLength(5);
    expect(plain).not.toMatch(ARC);
    expect(await render()).toBe(await render(true));
  });

  it('hops the later relation over the one it crosses, with lineHops: true', async () => {
    const plain = relations(await render(false));
    const svg = await render(true);
    assertInert(svg);
    const hopped = relations(svg);
    expect(hopped).toHaveLength(plain.length);
    // `Start ->> Cancel` crosses `Orders ->> Review`: one 6px arc on the later relation only,
    // which keeps its ends; every other relation is drawn as without hops.
    expect(hopped.slice(0, 4)).toEqual(plain.slice(0, 4));
    expect(hopped[4]!.match(ARC)).toHaveLength(1);
    expect(hopped[4]!.startsWith(plain[4]!.split('L')[0]!)).toBe(true);
    expect(hopped[4]!.endsWith(plain[4]!.slice(plain[4]!.lastIndexOf('L') + 1))).toBe(true);
  });
});
