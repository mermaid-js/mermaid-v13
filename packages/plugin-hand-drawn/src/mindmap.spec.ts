/**
 * Mindmap with the hand-drawn look (H4, #344), through `createMermaid().render()`: mindmap draws
 * every outline, the rule under a plain node and every edge through `w.outline` (D309), so each
 * one is sketched in every theme family (D307), the default node included (D308(c)).
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const SHAPES = `mindmap
  root((Root))
    a[Square]
      a1[Square child]
    b(Rounded)
    c))Bang((
    d)Cloud(
    e{{Hexagon}}
    f Default
      f1 Plain child
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('m', front + SHAPES);
}

/** Each `.node-bkg` element: its tag. */
const outlines = (svg: string) =>
  [...svg.matchAll(/<(\w+) [^>]*class="node-bkg node-(\w+)"/g)].map(([, tag, shape]) => [
    shape,
    tag,
  ]);

describe('mindmap hand-drawn (H4, D307, D308(c), D309)', () => {
  it.each(FAMILIES)('sketches every node shape, the rule and every edge in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    // The plain render draws each shape as a leaf; the sketch, as a group of roughjs paths.
    expect(outlines(plain.svg).every(([, tag]) => tag !== 'g')).toBe(true);
    const sketched = outlines(r.svg);
    expect(sketched.map(([shape]) => shape).sort()).toEqual(
      outlines(plain.svg)
        .map(([shape]) => shape)
        .sort()
    );
    // Under redux the plain nodes are drawn rounded (mindmapRoundedNodes, D288).
    const plainShape = theme === 'redux' ? 'rounded' : 'default';
    expect(new Set(sketched.map(([shape]) => shape))).toEqual(
      new Set(['circle', 'rect', 'rounded', 'bang', 'cloud', 'hexagon', plainShape])
    );
    expect(sketched.every(([, tag]) => tag === 'g')).toBe(true);
    expect(r.svg).not.toMatch(/<(?:rect|circle|polygon) /);
    // The rule under a plain node (classic families only) is sketched too.
    const rules = (s: string) => s.match(/<(\w+) class="node-line-\d+"/g) ?? [];
    expect(rules(plain.svg)).toHaveLength(theme === 'default' ? 2 : 0);
    expect(rules(r.svg)).toHaveLength(rules(plain.svg).length);
    expect(rules(r.svg).every((t) => t.startsWith('<g '))).toBe(true);
    // Every edge is one path, drawn twice over by roughjs (two moves), its paint kept.
    const edges = (s: string) => [
      ...s.matchAll(/<path d="([^"]*)"[^>]*class="edge [^"]*"([^>]*)\/>/g),
    ];
    expect(edges(r.svg)).toHaveLength(8);
    const before = edges(plain.svg);
    edges(r.svg).forEach(([, d, rest], i) => {
      expect(d!.match(/M/g)).toHaveLength(2);
      expect(d).not.toBe(before[i]![1]);
      expect(rest).toBe(before[i]![2]);
    });
    // The bounds come from the layout, not the sketch.
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });
});
