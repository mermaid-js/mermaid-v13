/**
 * Block with the hand-drawn look (D447, #558), through `createMermaid().render()` and the real
 * drawer: block draws each leaf's outline and inner lines through `w.outline` (`node`, `divider`),
 * so each leaf is sketched in every theme family (D307), as v12 sketched leaves only. Composites,
 * block arrows, edges and labels are written as before.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const BLOCK = `block-beta
  columns 3
  a["Square"] b(("Circle")) c[("Store")]
  block:g["Group"]:2
    d[["Sub"]]
  end
  e<["Next"]>(right)
  a --> b
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('b', front + BLOCK);
}

/** The first child element's tag of each leaf group, by its `data-id`. */
const leaves = (svg: string): Record<string, string> =>
  Object.fromEntries(
    [...svg.matchAll(/<g class="node [^"]*" data-id="([a-e])"[^>]*><(\w+)/g)].map(([, id, t]) => [
      id!,
      t!,
    ])
  );
const all = (s: string, re: RegExp) => s.match(re) ?? [];
const PLAIN = [
  /<rect class="basic cluster composite label-container"[^>]*\/>/g,
  /<polygon class="label-container block-arrow"[^>]*\/>/g,
  /<path class="edge-thickness-[^>]*\/>/g,
  /<text[^>]*>[^<]*/g,
];

describe('block hand-drawn (D447, D307)', () => {
  it.each(FAMILIES)('sketches every leaf and keeps the rest plain in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    // The plain render draws each leaf's outline as a shape; the sketch, as a group of paths.
    expect(leaves(plain.svg)).toEqual({
      a: 'rect',
      b: 'circle',
      c: 'path',
      d: 'rect',
      e: 'polygon',
    });
    expect(leaves(r.svg)).toEqual({ a: 'g', b: 'g', c: 'g', d: 'g', e: 'polygon' });
    for (const re of PLAIN) expect(all(r.svg, re), String(re)).toEqual(all(plain.svg, re));
    // The bounds come from the layout, not the sketch.
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });

  it('draws the same sketch on every render (R-ARCH-6)', async () => {
    expect((await render('redux', 'handDrawn')).svg).toBe((await render('redux', 'handDrawn')).svg);
  });
});
