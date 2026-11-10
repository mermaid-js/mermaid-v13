/**
 * Usecase with the hand-drawn look (D301, D319, #566, #567), through `createMermaid().render()`
 * and the real drawer: usecase draws each actor glyph, oval, rect, note and JSON frame through
 * `w.outline('node', …)`, each JSON cell as `part`, each boundary frame and tab as `group` and
 * each relationship line as `edge`, so each one is sketched in every theme family (D307). The
 * business marks and arrowheads stay plain (v12 drew them without roughjs), and the text is
 * written as before.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const USECASE = `usecase-beta
  actor User
  systemBoundary Shop
    Login
    Reset[Reset password]
  end
  "Shop"@{ type: package }
  Checkout@{ business: true }
  User --> Login
  User --> Checkout
  Login ..> : include Reset
  note for Login "Needs an account"
  json Order@{ "id": 1 }
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('u', front + USECASE);
}

/** The tag of each element whose class list starts with `cls`. */
const tags = (svg: string, cls: string): string[] =>
  [...svg.matchAll(new RegExp(`<(\\w+) class="${cls}\\b`, 'g'))].map(([, t]) => t!);
const all = (s: string, re: RegExp): string[] => s.match(re) ?? [];
/** Each relationship line's path data. */
const lines = (svg: string): string[] =>
  [...svg.matchAll(/<g class="relationship [^"]*"[^>]*><path d="([^"]*)"/g)].map(([, d]) => d!);

describe('usecase hand-drawn (D301, D319, D307)', () => {
  it.each(FAMILIES)('sketches every shape, cell, frame and line in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    // The plain render draws each outline as its leaf; the sketch, as a group of roughjs paths.
    expect(tags(plain.svg, 'usecase-actor-stick')).toEqual(['path']);
    expect(tags(r.svg, 'usecase-actor-stick')).toEqual(['g']);
    // Login, Reset (a rect), Checkout and the note.
    expect(tags(plain.svg, 'basic label-container')).toEqual([
      'ellipse',
      'rect',
      'ellipse',
      'rect',
    ]);
    expect(tags(r.svg, 'basic label-container')).toEqual(['g', 'g', 'g', 'g']);
    expect(tags(plain.svg, 'boundary-body')).toEqual(['rect']);
    expect(tags(r.svg, 'boundary-body')).toEqual(['g']);
    expect(tags(plain.svg, 'boundary-tab')).toEqual(['rect']);
    expect(tags(r.svg, 'boundary-tab')).toEqual(['g']);
    expect(tags(plain.svg, 'usecase-json-cell').length).toBe(3);
    expect(tags(r.svg, 'usecase-json-cell')).toEqual(['g', 'g', 'g']);
    // Each line is one path with a sketched `d`.
    const before = lines(plain.svg);
    const after = lines(r.svg);
    expect(after).toHaveLength(before.length);
    for (const [i, d] of after.entries()) expect(d, `line ${i}`).not.toBe(before[i]);
    // Business marks, arrowheads and text are written as before.
    for (const re of [
      /<path class="usecase-business-marker[^>]*>/g,
      /<path class="marker [^>]*>/g,
      /<text[^>]*>[^<]*/g,
    ])
      expect(all(r.svg, re), String(re)).toEqual(all(plain.svg, re));
    // The bounds come from the layout, not the sketch.
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });

  it('draws the same sketch on every render (R-ARCH-6)', async () => {
    expect((await render('redux', 'handDrawn')).svg).toBe((await render('redux', 'handDrawn')).svg);
  });
});
