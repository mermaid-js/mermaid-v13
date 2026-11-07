/**
 * Kanban with the hand-drawn look (D379, #459), through `createMermaid().render()`: kanban
 * draws its columns (`group`) and cards (`node`) through `w.outline`, so each one is sketched in
 * every theme family (D307), and the priority bar stays a plain line, which v12's card code
 * dropped.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const BOARD = `kanban
  todo[Todo]
    a[First card]@{ ticket: T-1, assigned: knsv, priority: 'Very High' }
    b[Second card]@{ priority: 'Low' }
  doing[In progress]
    c[Third card]
  done[Done]
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('k', front + BOARD);
}

/** The first child element's tag of each column and card group. */
const outlines = (svg: string, cls: RegExp): string[] =>
  [...svg.matchAll(new RegExp(`<g class="${cls.source}"[^>]*><(\\w+)`, 'g'))].map(([, t]) => t!);
const COLUMN = /cluster section-\d+/;
const CARD = /node/;

describe('kanban hand-drawn (D379, D307)', () => {
  it.each(FAMILIES)('sketches every column and card and keeps the bars in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    // The plain render draws each outline as a `rect`; the sketch, as a group of roughjs paths.
    expect(outlines(plain.svg, COLUMN)).toEqual(['rect', 'rect', 'rect']);
    expect(outlines(plain.svg, CARD)).toEqual(['rect', 'rect', 'rect']);
    expect(outlines(r.svg, COLUMN)).toEqual(['g', 'g', 'g']);
    expect(outlines(r.svg, CARD)).toEqual(['g', 'g', 'g']);
    expect(r.svg).not.toMatch(/<rect /);
    // The priority bars, the ticket link and the text are written as before.
    const plainOf = (s: string, re: RegExp) => s.match(re) ?? [];
    for (const re of [/<line class="kanban-priority"[^>]*\/>/g, /<a [^>]*>/g, /<text[^>]*>/g])
      expect(plainOf(r.svg, re)).toEqual(plainOf(plain.svg, re));
    expect(plainOf(r.svg, /<line class="kanban-priority"/g)).toHaveLength(2);
    // The bounds come from the layout, not the sketch.
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });
});
