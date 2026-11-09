/**
 * Venn with the hand-drawn look (D319, #501), through `createMermaid().render()` and the real
 * drawer: venn draws each set's circle and each overlap a style fills through
 * `w.outline('node', 'path')`, so each one is sketched in every theme family (D307). An unfilled
 * overlap stays a plain transparent path, and labels and text nodes are written as before. One
 * solve (D412): the sketch sits on the drawn circles, and the bounds come from the layout.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const VENN = `venn-beta
  title Skills
  set A["Frontend"]
    text React
  set B["Backend"]
  set C["Ops"]
  union A, B["Full stack"]
  union B, C
  style A,B fill:#ffe66d
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('v', front + VENN);
}

/** The first child element's tag of each area group of `kind`. */
const outlines = (svg: string, kind: string): string[] =>
  [...svg.matchAll(new RegExp(`<g class="venn-area ${kind}[^"]*"[^>]*><(\\w+)`, 'g'))].map(
    ([, t]) => t!
  );

describe('venn hand-drawn (D319, D307)', () => {
  it.each(FAMILIES)('sketches every circle and the filled overlap in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    // The plain render draws each outline as a `path`; the sketch, as a group of roughjs paths.
    expect(outlines(plain.svg, 'venn-circle')).toEqual(['path', 'path', 'path']);
    expect(outlines(r.svg, 'venn-circle')).toEqual(['g', 'g', 'g']);
    // The filled overlap (A, B) is sketched; the unfilled one (B, C) stays a plain path.
    expect(outlines(plain.svg, 'venn-intersection')).toEqual(['path', 'path']);
    expect(outlines(r.svg, 'venn-intersection')).toEqual(['g', 'path']);
    expect(r.svg).toMatch(
      /<g class="venn-area venn-intersection" data-venn-sets="B_C"[^>]*><path [^>]*fill="transparent"/
    );
    // Labels, the title and the text node are written as before.
    const all = (s: string, re: RegExp) => s.match(re) ?? [];
    expect(all(r.svg, /<text[^>]*>[^<]*/g)).toEqual(all(plain.svg, /<text[^>]*>[^<]*/g));
    // The bounds come from the layout, not the sketch.
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });

  it('draws the same sketch on every render (R-ARCH-6)', async () => {
    expect((await render('redux', 'handDrawn')).svg).toBe((await render('redux', 'handDrawn')).svg);
  });
});
