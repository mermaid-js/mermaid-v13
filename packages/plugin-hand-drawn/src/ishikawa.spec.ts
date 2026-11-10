/**
 * Ishikawa with the hand-drawn look (D494, #585), through `createMermaid().render()` and the real
 * drawer: ishikawa draws its head (`w.outline('node', 'path')`), its label boxes
 * (`w.outline('node', 'rect')`) and its spine, cause and sub-cause bones
 * (`w.outline('edge', 'line')`) through the hook, so each one is sketched in every theme family
 * (D307), at the drawer's role defaults (D494's own parameters cannot be passed, GAPS #583).
 * Arrowheads stay plain filled paths (D302), text is written as before, and the bounds come
 * from the layout.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const ISHIKAWA = `ishikawa-beta
  Blurry photo
  Process
    Out of focus
    Lens
  User
    Shaky hands
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('v', front + ISHIKAWA);
}

/** The tag of each element of `cls` (`<tag class="cls"` or `<tag class="cls …"`). */
const tags = (svg: string, cls: string): string[] =>
  [...svg.matchAll(new RegExp(`<(\\w+) class="${cls}(?:"| )`, 'g'))].map(([, t]) => t!);

describe('ishikawa hand-drawn (D494, D307)', () => {
  it.each(FAMILIES)('sketches the head, boxes, spine and bones in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    // The plain render's shapes; the sketch draws a closed shape as a group of roughjs paths and
    // a line as one path.
    expect(tags(plain.svg, 'ishikawa-head')).toEqual(['path']);
    expect(tags(r.svg, 'ishikawa-head')).toEqual(['g']);
    expect(tags(plain.svg, 'ishikawa-label-box')).toEqual(['rect', 'rect']);
    expect(tags(r.svg, 'ishikawa-label-box')).toEqual(['g', 'g']);
    for (const bone of ['ishikawa-spine', 'ishikawa-branch', 'ishikawa-sub-branch']) {
      expect(
        tags(plain.svg, bone).every((t) => t === 'line'),
        bone
      ).toBe(true);
      expect(tags(r.svg, bone), bone).toEqual(tags(plain.svg, bone).map(() => 'path'));
    }
    expect(r.svg).not.toMatch(/<line /);
    expect(r.svg).not.toMatch(/<rect /);
    // Arrowheads stay plain filled triangles, as drawn without the look.
    const arrows = (s: string) => s.match(/<path class="ishikawa-arrow"[^>]*\/>/g) ?? [];
    expect(arrows(r.svg)).toEqual(arrows(plain.svg));
    expect(arrows(r.svg)).toHaveLength(5);
    // Text is written as before, and the bounds come from the layout, not the sketch.
    const texts = (s: string) => s.match(/<text[^>]*>[^<]*/g) ?? [];
    expect(texts(r.svg)).toEqual(texts(plain.svg));
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });

  it('draws the same sketch on every render (R-ARCH-6)', async () => {
    expect((await render('redux', 'handDrawn')).svg).toBe((await render('redux', 'handDrawn')).svg);
  });
});
