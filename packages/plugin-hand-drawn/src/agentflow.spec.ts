/**
 * Agentflow with the hand-drawn look (#548, #550), through `createMermaid().render()` and the
 * real drawer: agentflow draws every outline through `w.outline` (`node` for vertices and the
 * collapsed card, `divider` for the tool's rails, the refdoc's rule and the card's separator,
 * `mark` for the card's dots, `group` for flow frames, `edge` for edges), so v12's sketched
 * shapes, frames and cards are sketched in every theme family (D307). Arrowheads and labels are
 * written as before, and the layout does not move.
 */
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const AGENTFLOW = `agentflow-beta LR
  flow work["Work"]
    i["In"]@{ shape: input }
    t["Task"]@{ shape: task }
    u["Tool"]@{ shape: tool }
    i --> t --> u
  end
  flow done["Done"]
    r["Notes"]@{ shape: refdoc }
  end
  done@{ view: "collapsed" }
  d["Ok?"]@{ shape: decision }
  a["Act"]@{ shape: action }
  n["Spec"]@{ shape: refdoc }
  u --> d
  d --x a
  d -.- done
  a --> n
`;
const FAMILIES = ['default', 'redux', 'neo', 'neo-dark'];

async function render(theme: string, look?: string) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([handDrawn]);
  const front = `---\nconfig:\n  theme: ${theme}\n${look ? `  look: ${look}\n` : ''}---\n`;
  return m.render('a', front + AGENTFLOW);
}

/** The first child element's tag of each node and frame group, by its `data-id`. */
const outlines = (svg: string): Record<string, string> =>
  Object.fromEntries(
    [...svg.matchAll(/<g class="(?:node|cluster)[^"]*" data-id="(\w+)"[^>]*><(\w+)/g)].map(
      ([, id, t]) => [id!, t!]
    )
  );
const all = (s: string, re: RegExp) => s.match(re) ?? [];
const PLAIN = [/<path class="marker"[^>]*\/>/g, /<text[^>]*>[^<]*/g];
const EDGE = /<path class="flowchart-link [^"]*" data-id="[^"]*" data-ast="[^"]*" d="([^"]*)"/g;

describe('agentflow hand-drawn (D301, D307)', () => {
  it.each(FAMILIES)('sketches every outline and keeps the rest plain in %s', async (theme) => {
    const plain = await render(theme);
    const r = await render(theme, 'handDrawn');
    expect(r.warnings).toEqual([]);
    // Plain: each vertex, the card and the frame are a shape; sketched, a group of paths.
    expect(outlines(plain.svg)).toEqual({
      work: 'rect',
      done: 'rect',
      i: 'polygon',
      t: 'rect',
      u: 'rect',
      d: 'polygon',
      a: 'polygon',
      n: 'path',
    });
    const sketched = outlines(r.svg);
    expect(Object.keys(sketched)).toEqual(Object.keys(outlines(plain.svg)));
    expect(new Set(Object.values(sketched))).toEqual(new Set(['g']));
    // The card's separator and dots, and the edges, are sketched too.
    expect(r.svg).toContain('<g class="collapsed-separator"');
    expect(all(r.svg, /<g class="collapsed-indicator"/g)).toHaveLength(3);
    const edges = (svg: string) => [...svg.matchAll(EDGE)].map((m) => m[1]);
    expect(edges(r.svg)).toHaveLength(6);
    expect(edges(r.svg)).not.toEqual(edges(plain.svg));
    for (const re of PLAIN) expect(all(r.svg, re), String(re)).toEqual(all(plain.svg, re));
    // The bounds come from the layout, not the sketch.
    expect(/viewBox="[^"]*"/.exec(r.svg)![0]).toBe(/viewBox="[^"]*"/.exec(plain.svg)![0]);
  });

  it('draws the same sketch on every render (R-ARCH-6)', async () => {
    expect((await render('redux', 'handDrawn')).svg).toBe((await render('redux', 'handDrawn')).svg);
  });
});
