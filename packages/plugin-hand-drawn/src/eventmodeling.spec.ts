/**
 * Event modeling with the hand-drawn look (option A, decided by the maintainer on 2026-11-10,
 * with D537's line hops), through `createMermaid().render()`: lanes (`group`), boxes (`node`)
 * and relations (`edge`) draw through `w.outline`, so each one is sketched in every theme family
 * (D307); the arrowheads and the text are written as before.
 */
import { readFileSync } from 'node:fs';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const MODEL = readFileSync(
  new URL('../../../e2e/diagrams/eventmodeling/baseline/themes/default.mmd', import.meta.url),
  'utf8'
).replace(/^---\n[\s\S]*?\n---\n/, '');
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('e', front + MODEL);
}

/** The first child element's tag of each lane and box group. */
const outlines = (svg: string, cls: string): string[] =>
  [...svg.matchAll(new RegExp(`<g class="${cls}"[^>]*><(\\w+)`, 'g'))].map(([, t]) => t!);
const all = (s: string, re: RegExp): string[] => s.match(re) ?? [];

describe('event modeling hand-drawn (option A, D307)', () => {
  it.each(FAMILIES)('sketches every lane, box and relation in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    const lanes = outlines(plain.svg, 'em-swimlane');
    const boxes = outlines(plain.svg, 'em-box');
    expect(lanes.length).toBeGreaterThan(1);
    expect(new Set([...lanes, ...boxes])).toEqual(new Set(['rect']));
    // The plain render draws lanes and boxes as `rect`s; the sketch, as groups of roughjs paths.
    expect(outlines(r.svg, 'em-swimlane')).toEqual(lanes.map(() => 'g'));
    expect(outlines(r.svg, 'em-box')).toEqual(boxes.map(() => 'g'));
    expect(r.svg).not.toMatch(/<rect /);
    // A relation stays one `path.em-relation` with its ids, its line redrawn.
    const rel = /<path class="em-relation"[^>]*>/g;
    const ids = (s: string) => all(s, rel).map((p) => p.replace(/ d="[^"]*"/, ''));
    expect(ids(r.svg)).toEqual(ids(plain.svg));
    expect(all(r.svg, rel)).not.toEqual(all(plain.svg, rel));
    // The heads and the text are written as before; the bounds come from the layout.
    for (const re of [/<polygon[^>]*\/>/g, /<text[^>]*>[\s\S]*?<\/text>/g])
      expect(all(r.svg, re)).toEqual(all(plain.svg, re));
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });
});
