// Flowchart text-output checks shared by the corpus specs that draw through flowchart's `ascii`
// hook (`corpus.spec.ts`, `swimlane-corpus.spec.ts`): the text's size against `rows`/`columns`,
// boxes overlapping in the cell layout, and what sits on a group frame (pitfall 20). The size
// and overlap checks serve the other types' ASCII suites too.
import { cellWidth } from '@mermaid-js/core/ascii';
import type { LayoutModel, Point } from '@mermaid-js/core/layout';
import type { TextRenderResult } from 'mermaid';
import type { CellLayout } from './render.ts';
import type { Charset } from './structure.ts';

/** A line's width in cells, measured apart from the API's `cellWidth` where that is possible. */
function flowWidth(line: string): number {
  // A line of printable ASCII, box drawing and the arrowhead/marker shapes is one column per
  // code point. Lines with other text (CJK, emoji, combining marks) fall back to `cellWidth`;
  // there the check is a contract check of `columns` against the kit's own measure, whose
  // widths have table tests in core/ascii (measurer.spec.ts, R-ASCII-3).
  return /^[\x20-\x7e─-◿✕]*$/u.test(line) ? [...line].length : cellWidth(line);
}

/**
 * `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces, no
 * `\r`. `width` measures a line: flowchart's own measure by default, the kit's `cellWidth` for
 * the suites that pass it.
 */
export function sizeFaults(
  { text, rows, columns }: Pick<TextRenderResult, 'text' | 'rows' | 'columns'>,
  width: (line: string) => number = flowWidth
): string[] {
  // An empty diagram (`graph TD;`) is no lines: rows 0, columns 0.
  const lines = text === '' ? [] : text.split('\n');
  const widest = Math.max(0, ...lines.map((l) => width(l)));
  const found: string[] = [];
  if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
  if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
  lines.forEach((l, i) => {
    if (/\s$/u.test(l)) found.push(`trailing space on line ${i + 1}`);
  });
  if (text.includes('\r')) found.push('\\r in text');
  return found;
}

interface Rect {
  id: string;
  group: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cells a centred box covers, the grid model's convention (`LayoutGraph.grid`). */
const rect = (
  id: string,
  group: boolean,
  b: { x: number; y: number; width: number; height: number }
): Rect => ({
  id,
  group,
  x0: Math.round(b.x - b.width / 2 + 0.5),
  y0: Math.round(b.y - b.height / 2 + 0.5),
  x1: Math.round(b.x + b.width / 2 - 0.5),
  y1: Math.round(b.y + b.height / 2 - 0.5),
});

/** Overlapping boxes: nodes apart; a node or group inside a group, or apart. */
export function overlaps(model: LayoutModel): string[] {
  const rects = [
    ...[...model.nodes].map(([id, n]) => rect(id, false, n)),
    ...[...model.groups].map(([id, g]) => rect(id, true, g)),
  ];
  const apart = (a: Rect, b: Rect) => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
  const within = (a: Rect, b: Rect) =>
    b.group && a.x0 > b.x0 && a.x1 < b.x1 && a.y0 > b.y0 && a.y1 < b.y1;
  const found: string[] = [];
  rects.forEach((a, i) => {
    for (const b of rects.slice(i + 1)) {
      if (!apart(a, b) && !within(a, b) && !within(b, a)) found.push(`${a.id} × ${b.id}`);
    }
  });
  return found;
}

/** Glyphs a frame's border may show besides its title: lines, corners and junctions. */
const FRAME = { unicode: /^[─-╿]$/u, ascii: /^[-|+=I.:]$/ };

/**
 * What is wrong on the group frames of a flowchart's text drawing (pitfall 20): any border
 * cell outside the title (and the blank either side of it) that is not a line glyph, so an
 * arrowhead, a marker or edge-label text on a frame. An edge between a group and its own
 * member ends on that group's frame (#42), so its end cells there are exempt. `routes` are the
 * repaired routes in cells (`repairRoutes`), which give where the drawing starts.
 */
export function frameFaults(
  text: string,
  layout: CellLayout,
  routes: ReadonlyMap<string, readonly Point[]>,
  charset: Charset
): string[] {
  const { flow } = layout;
  if (flow.groups.length === 0) return [];
  // The drawing is trimmed to its leftmost and topmost cells; the front-matter title adds rows.
  const boxes = [
    ...[...layout.nodes.values()].map((n) => rect('', false, n)),
    ...[...layout.groups.values()].map((g) => rect('', true, g)),
  ];
  const points = [...routes.values()].flat();
  const ox = Math.min(...boxes.map((b) => b.x0), ...points.map((p) => p.x));
  const oy = Math.min(...boxes.map((b) => b.y0), ...points.map((p) => p.y));
  const top = layout.title?.trim() ? 1 : 0;
  const rows = text.split('\n').map((l) => [...l]);
  const at = (x: number, y: number): string => rows[y - oy + top]?.[x - ox] ?? ' ';

  const exempt = new Set<string>();
  for (const e of flow.edges) {
    const route = routes.get(e.id);
    if (!route || route.length === 0) continue;
    const ends = [route[0]!, route[route.length - 1]!];
    for (const p of ends) exempt.add(`${p.x},${p.y}`);
  }
  const groupEnds = new Set(flow.edges.flatMap((e) => [e.source, e.target]));

  const found: string[] = [];
  for (const g of flow.groups) {
    const box = layout.groups.get(g.id);
    if (!box) continue;
    const r = rect(g.id, true, box);
    const title = new Set<string>();
    if (g.label.width > 0) {
      // The block the drawing writes the title in (its first line on the border), a blank
      // either side.
      const height = Math.max(g.label.height, 1);
      const t = rect('', false, { ...box.title, width: g.label.width, height });
      for (let x = t.x0 - 1; x <= t.x1 + 1; x++) title.add(`${x},${t.y0}`);
    }
    const cells: [number, number][] = [];
    for (let x = r.x0; x <= r.x1; x++) cells.push([x, r.y0], [x, r.y1]);
    for (let y = r.y0 + 1; y < r.y1; y++) cells.push([r.x0, y], [r.x1, y]);
    for (const [x, y] of cells) {
      const key = `${x},${y}`;
      if (title.has(key) || (groupEnds.has(g.id) && exempt.has(key))) continue;
      const glyph = at(x, y);
      if (!FRAME[charset].test(glyph))
        found.push(`${g.id}: ${JSON.stringify(glyph)} on its frame at ${x - ox},${y - oy + top}`);
    }
  }
  return found;
}
