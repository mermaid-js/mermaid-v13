/**
 * Swimlanes with the hand-drawn look (spec #528, D301, #598), through `createMermaid().render()`:
 * flowchart draws each lane's title band and body through `w.outline('group', …)`, so both are
 * sketched, as v12's rough.js lanes were, and keep v12's classes on the sketch's `<g>`. In a
 * colour theme the sketched outline takes the lane's palette slot (v12 `path:nth-of-type(2)`).
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const LANES = `swimlane-beta DIRECTION
  subgraph Sales
    A --> B
  end
  subgraph Ops
    C
  end
  B --> C
  Loose --> A
`;
const FAMILIES = ['default', 'redux', 'redux-color', 'neo', 'neo-dark'];

async function render(theme: string, look?: string, direction = 'TB') {
  const m = createMermaid();
  m.initialize({ deterministic: true, output: { cssVariables: false } });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('s', front + LANES.replace('DIRECTION', direction));
}

/** The first child's tag of each lane half, in order. */
const halves = (svg: string, part: 'title' | 'body'): string[] =>
  [...svg.matchAll(new RegExp(`<(\\w+) class="swimlane-${part}"`, 'g'))].map(([, t]) => t!);

describe('swimlane hand-drawn lanes (D301)', () => {
  it.each(FAMILIES)('sketches both halves of every lane in %s', async (theme) => {
    for (const direction of ['TB', 'LR']) {
      const plain = await render(theme, undefined, direction);
      const r = await render(theme, 'handDrawn', direction);
      expect(r.warnings).toEqual([]);
      // Sales, Ops and the default lane.
      expect(halves(plain.svg, 'title')).toEqual(['rect', 'rect', 'rect']);
      expect(halves(plain.svg, 'body')).toEqual(['rect', 'rect', 'rect']);
      expect(halves(r.svg, 'title')).toEqual(['g', 'g', 'g']);
      expect(halves(r.svg, 'body')).toEqual(['g', 'g', 'g']);
      expect(r.svg).not.toMatch(/<rect /);
      // The bounds come from the layout, not the sketch; labels are written as before.
      expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
      const labels = (s: string) => s.match(/<text class="cluster-label swimlane-label"[^>]*>/g);
      expect(labels(r.svg)).toEqual(labels(plain.svg));
    }
  });

  it('strokes the sketched outline of both halves with the lane palette slot (redux-color)', async () => {
    const r = await render('redux-color', 'handDrawn');
    // Sales takes slot 0 (#e879f9): roughjs writes the hachure fill first, then the outline.
    const sales = /<g class="cluster swimlane" data-id="Sales"[^>]*>(.*?)<text/.exec(r.svg)![1]!;
    const outlines = [...sales.matchAll(/<g class="swimlane-(\w+)">(.*?)<\/g>/g)].map(
      ([, part, inner]) => [part, [...inner!.matchAll(/stroke="([^"]+)"/g)].map((m) => m[1])]
    );
    expect(outlines.map(([part]) => part)).toEqual(['body', 'title']);
    for (const [, strokes] of outlines) expect(strokes).toContain('#e879f9');
  });
});
