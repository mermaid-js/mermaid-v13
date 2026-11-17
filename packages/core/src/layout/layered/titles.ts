// A pass over the pixel model, after the routes are final (#675). A group's title sits at the
// middle of its top padding (`groupModels`), which is where the routes of edges that enter or
// leave the group through its top run. A title that a route runs through moves along its band
// to the nearest place `endLabelAcross` clear of every route, inside the group's padding
// (`padding.left` on both sides); on a tie the first in route order wins. A title no route
// runs through, or one with no such place, stays. Routes and sizes do not change. On the grid
// `placeTitles` does this.
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { pxProfile } from '../units.ts';

export function clearTitles(graph: LayoutGraph, model: LayoutModel): LayoutModel {
  const gap = (graph.metrics ?? pxProfile.engine).endLabelAcross;
  for (const g of graph.groups) {
    const box = model.groups.get(g.id)!;
    const size = g.title;
    if (!size) continue;
    const { x, y } = box.title;
    const half = size.width / 2;
    const taken = spans(model, y, size.height / 2, gap + half);
    const room = box.width / 2 - g.padding.left - half;
    // Covered, `d` inside a span's ends: d = gap where a route runs through the title itself.
    const hit = (c: number, d: number): boolean =>
      taken.some(([lo, hi]) => c > lo! + d && c < hi! - d);
    // The nearest end of a span that no span covers, the first of equals.
    const fits = taken.flat().filter((c) => Math.abs(c - x) <= room && !hit(c, 0));
    if (hit(x, gap)) box.title.x = fits.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0] ?? x;
  }
  return model;
}

// The open spans of title centres that would put a title, `reach` wide either side of its
// centre, over a route segment that runs in the band `half` above and below `y`.
function spans(model: LayoutModel, y: number, half: number, reach: number): number[][] {
  const out: number[][] = [];
  for (const { points: p } of model.edges.values()) {
    p.forEach((b, i) => {
      const a = p[i - 1];
      if (a && Math.min(a.y, b.y) < y + half && Math.max(a.y, b.y) > y - half)
        out.push([Math.min(a.x, b.x) - reach, Math.max(a.x, b.x) + reach]);
    });
  }
  return out;
}
