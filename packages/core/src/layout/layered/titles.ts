// A pass over the pixel model, after the routes are final (#675). A group's title sits at the
// middle of its top padding (`groupModels`), which is where the routes of edges that enter or
// leave the group through its top run. A title that a route would cover moves along its band to
// the nearest place clear of every route by `endLabelAcross` and inside the group's padding (`padding.left`
// on both sides); with no such place it stays. Routes and sizes do not change. On the grid
// `placeTitles` does this.
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { pxProfile } from '../units.ts';

export function clearTitles(graph: LayoutGraph, model: LayoutModel): LayoutModel {
  const gap = (graph.metrics ?? pxProfile.engine).endLabelAcross;
  for (const g of graph.groups) {
    const box = model.groups.get(g.id);
    const size = g.title;
    if (!size || !box) continue;
    const { x, y } = box.title;
    const half = size.width / 2;
    const taken = spans(model, y, size.height / 2, gap + half);
    const room = box.width / 2 - g.padding.left - half;
    // Its own centre first; else the nearest end of a span, the first of equals.
    const fits = [x, ...taken.flat()].filter(
      (c) => Math.abs(c - x) <= room && taken.every(([lo, hi]) => c <= lo! || c >= hi!)
    );
    box.title.x = fits.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0] ?? x;
  }
  return model;
}

// The open spans of title centres that would put a title, `reach` wide either side of its
// centre, over a route segment that runs in the band `half` above and below `y`.
function spans(model: LayoutModel, y: number, half: number, reach: number): number[][] {
  const out: number[][] = [];
  for (const { points: p } of model.edges.values()) {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      if (Math.min(a.y, b.y) < y + half && Math.max(a.y, b.y) > y - half)
        out.push([Math.min(a.x, b.x) - reach, Math.max(a.x, b.x) + reach]);
    }
  }
  return out;
}
