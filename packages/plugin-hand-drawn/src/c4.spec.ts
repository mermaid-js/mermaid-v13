/**
 * C4 with the hand-drawn look (D301, D307, #542), through `createMermaid().render()` and the real
 * drawer: C4 draws each element's outline through `w.outline` (`node`) and the cylinder's and
 * the queue's rims and `fr-rect`'s frame lines (`divider`), so each element is sketched in every
 * theme family, as v12 sketched elements only. Boundaries, relations, arrowheads, label boxes
 * and text are written as before.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const C4 = `C4Container
Person(user, "User")
Container_Boundary(b, "Bank") {
  Container(web, "Web", "Java")
  ContainerDb(db, "Database")
  ContainerQueue(q, "Queue")
  Component(fr, "Frame", "Go", $sprite="component")
}
Rel(user, web, "Uses")
Rel(web, db, "Reads")
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('c', front + C4);
}

/** The first child element's tag of each element group, by its `data-id`. */
const elements = (svg: string): Record<string, string> =>
  Object.fromEntries(
    [...svg.matchAll(/<g class="node c4-shape [^"]*" data-id="(\w+)"[^>]*><(\w+)/g)].map(
      ([, id, t]) => [id!, t!]
    )
  );
const all = (s: string, re: RegExp) => s.match(re) ?? [];
const PLAIN = [
  /<g class="c4-boundary[^"]*"[^>]*><rect [^>]*\/>/g,
  /<path class="c4-rel [^>]*\/>/g,
  /<path class="marker"[^>]*\/>/g,
  /<rect class="c4-rel-label-box"[^>]*\/>/g,
  /<text[^>]*>[^<]*/g,
];

describe('C4 hand-drawn (D301, D307)', () => {
  it.each(FAMILIES)('sketches every element and keeps the rest plain in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    const ids = ['user', 'web', 'db', 'q', 'fr'];
    // The plain render draws each element's outline as a shape; the sketch, as a group of paths.
    expect(Object.keys(elements(plain.svg)).sort()).toEqual([...ids].sort());
    expect(Object.values(elements(plain.svg))).not.toContain('g');
    expect(elements(r.svg)).toEqual(Object.fromEntries(ids.map((id) => [id, 'g'])));
    for (const re of PLAIN) expect(all(r.svg, re), String(re)).toEqual(all(plain.svg, re));
    // The bounds come from the layout, not the sketch.
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });

  it('draws the same sketch on every render (R-ARCH-6)', async () => {
    expect((await render('redux', 'handDrawn')).svg).toBe((await render('redux', 'handDrawn')).svg);
  });
});
