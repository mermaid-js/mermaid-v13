import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTheme, DEFAULT_THEME, isThemeName, loadTheme } from '@mermaid-js/core/theme';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// The edges of tri, flip-tri, procs and docs end on their outlines (#395, #403): drawn through
// `createMermaid().render()`, every edge end at one of them lies within 1 px of the outline the
// node draws (the topmost layer's edge of a stack, not a layer's inner edge).
const FIXTURE = join(REPO_ROOT, 'e2e/diagrams/flowchart/visual-check/triangle-and-stack-edges.mmd');
const SHAPED = ['t', 'f', 's', 'u'];

type Pt = readonly [number, number];

const num = (s: string): number[] => s.trim().split(/[ ,]+/).map(Number);

/** The points of an SVG arc (no rotation) from `from`, in 40 steps. */
function arc(from: Pt, [rx0, ry0, , large, sweep, x, y]: number[]): Pt[] {
  const [hx, hy] = [(from[0] - x!) / 2, (from[1] - y!) / 2];
  const grow = Math.sqrt(Math.max(1, (hx / rx0!) ** 2 + (hy / ry0!) ** 2));
  const [rx, ry] = [rx0! * grow, ry0! * grow];
  const den = rx * rx * hy * hy + ry * ry * hx * hx;
  const k =
    (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / (den || 1)));
  const [cx, cy] = [(k * rx * hy) / ry, (-k * ry * hx) / rx];
  const a0 = Math.atan2((hy - cy) / ry, (hx - cx) / rx);
  let da = Math.atan2((-hy - cy) / ry, (-hx - cx) / rx) - a0;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  const [mx, my] = [(from[0] + x!) / 2, (from[1] + y!) / 2];
  return Array.from({ length: 40 }, (_, i): Pt => {
    const a = a0 + (da * (i + 1)) / 40;
    return [mx + cx + rx * Math.cos(a), my + cy + ry * Math.sin(a)];
  });
}

/** A path of M, L, Q, A and Z commands as points, each curve in 40 steps. */
function flatten(d: string): Pt[] {
  const out: Pt[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLQA])([^MLQAZ]*)/g)) {
    const n = num(args!);
    const last = out.at(-1)!;
    if (cmd === 'Q') {
      for (let k = 1; k <= 40; k++) {
        const u = k / 40;
        const b = (i: number): number =>
          (1 - u) ** 2 * last[i]! + 2 * (1 - u) * u * n[i]! + u ** 2 * n[i + 2]!;
        out.push([b(0), b(1)]);
      }
    } else if (cmd === 'A') out.push(...arc(last, n));
    else out.push([n[0]!, n[1]!]);
  }
  return out;
}

/** The outlines in a node's markup before its label, in the node's own coordinates. */
function layersOf(markup: string): Pt[][] {
  const shift: Pt[] = [[0, 0]];
  const layers: Pt[][] = [];
  for (const m of markup.matchAll(/<(\/?)(g|polygon|rect|path|circle)\b([^>]*)>/g)) {
    const [, closing, tag, attrs] = m;
    const [dx, dy] = shift.at(-1)!;
    const attr = (k: string): string => new RegExp(`\\b${k}="([^"]*)"`).exec(attrs!)?.[1] ?? '';
    const at = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
    if (tag === 'g') {
      const t = /translate\(([^)]*)\)/.exec(attr('transform'));
      if (closing) shift.pop();
      else shift.push(t ? [dx + num(t[1]!)[0]!, dy + num(t[1]!)[1]!] : [dx, dy]);
    } else if (closing) continue;
    else if (tag === 'polygon') {
      const n = num(attr('points'));
      layers.push(Array.from({ length: n.length / 2 }, (_, i) => at([n[2 * i]!, n[2 * i + 1]!])));
    } else if (tag === 'rect') {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => Number(attr(k)));
      const r = Math.min(Number(attr('rx') || 0), w! / 2, h! / 2);
      // Each corner's quarter arc, clockwise from the top left.
      const corners: [number, number, number][] = [
        [x! + r, y! + r, Math.PI],
        [x! + w! - r, y! + r, -Math.PI / 2],
        [x! + w! - r, y! + h! - r, 0],
        [x! + r, y! + h! - r, Math.PI / 2],
      ];
      layers.push(
        corners.flatMap(([cx, cy, a]) =>
          Array.from({ length: 11 }, (_, i): Pt => {
            const b = a + (i * Math.PI) / 20;
            return at([cx + r * Math.cos(b), cy + r * Math.sin(b)]);
          })
        )
      );
    } else if (tag === 'circle') {
      const [cx, cy, r] = ['cx', 'cy', 'r'].map((k) => Number(attr(k) || 0));
      layers.push(
        Array.from({ length: 80 }, (_, i) =>
          at([cx! + r! * Math.cos((i * Math.PI) / 40), cy! + r! * Math.sin((i * Math.PI) / 40)])
        )
      );
    } else layers.push(flatten(attr('d')).map(at));
  }
  return layers;
}

/** The distance from `p` to the polygon's edge, and whether `p` is inside it. */
function against(poly: Pt[], p: Pt): { dist: number; inside: boolean } {
  let dist = Infinity;
  let inside = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const k = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1))
    );
    dist = Math.min(dist, Math.hypot(p[0] - a[0] - k * ex, p[1] - a[1] - k * ey));
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * ex)
      inside = !inside;
  }
  return { dist, inside };
}

/** How far `p` is from the outer outline of the layers: from one, and not inside another. */
function offOutline(layers: Pt[][], p: Pt): number {
  const hits = layers.map((l) => against(l, p));
  const onOne = Math.min(...hits.map((h) => h.dist));
  const buried = Math.max(0, ...hits.map((h) => (h.inside ? h.dist : 0)));
  return Math.max(onOne, buried);
}

interface Drawn {
  readonly nodes: Map<string, { at: Pt; layers: Pt[][] }>;
  readonly edges: { from: string; to: string; start: Pt; end: Pt; tip?: Pt }[];
}

/** A fixture's nodes (position, outlines) and edges (line ends, arrowhead tip), as rendered. */
async function draw(path: string, flow?: string): Promise<Drawn> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const text = readFileSync(path, 'utf8');
  // `flow` turns the fixture's flowchart the other way.
  const source = flow ? text.replace(/^flowchart \w+/m, `flowchart ${flow}`) : text;
  const { svg } = await m.render('mermaid-0', source);
  const nodes: Drawn['nodes'] = new Map();
  for (const n of svg.matchAll(
    /<g class="node [^"]*" data-id="([^"]+)"[^>]*transform="translate\(([^)]*)\)">([\s\S]*?)(?=<text|<g class="node |<\/g><\/g>)/g
  )) {
    const [x, y] = num(n[2]!);
    nodes.set(n[1]!, { at: [x!, y!], layers: layersOf(n[3]!) });
  }
  const edges: Drawn['edges'] = [];
  for (const e of svg.matchAll(
    /<g class="edge [^"]*" data-id="[^"]*" data-ast="e:([^&"]+)&gt;([^"]+)">(.*?)<\/g>/g
  )) {
    const line = flatten(/<path d="([^"]*)"/.exec(e[3]!)![1]!);
    const head = /class="marker" d="M([^LZ]*)/.exec(e[3]!)?.[1];
    edges.push({
      from: e[1]!,
      to: e[2]!,
      start: line[0]!,
      end: line.at(-1)!,
      tip: head ? (num(head) as unknown as Pt) : undefined,
    });
  }
  return { nodes, edges };
}

describe('flowchart tri, flip-tri, procs and docs edge ends (#395, #403)', () => {
  it('ends every edge on the drawn outline within 1 px', async () => {
    const { nodes, edges: found } = await draw(FIXTURE);
    // The arrowhead stops short of the outline by a fixed gap: measured on a plain rectangle.
    const rectEnd = found.find((f) => !SHAPED.includes(f.to))!;
    const rect = nodes.get(rectEnd.to)!;
    const gap = rect.at[0] + rect.layers[0]![0]![0] - rectEnd.tip![0];
    expect(gap).toBeGreaterThan(0);
    let checked = 0;
    for (const f of found) {
      for (const id of [f.from, f.to]) {
        const node = nodes.get(id);
        if (!node || !SHAPED.includes(id)) continue;
        // The source end is the line's start; the target end is the tip, `gap` further on.
        const p: Pt = id === f.to ? [f.tip![0] + gap, f.tip![1]] : f.start;
        const local: Pt = [p[0] - node.at[0], p[1] - node.at[1]];
        const off = offOutline(node.layers, local);
        checked++;
        expect(off, `${f.from}>${f.to} at ${id}`).toBeLessThanOrEqual(1);
      }
    }
    // Every edge of the fixture touches one of the four shapes.
    expect(checked).toBe(16);
  });
});

// Edges that meet one side of a shape end at points of their own, each on the outline, and an
// arrowhead stops the theme's `arrowheadGap` short of it (#1149, #1157, #1151, #1164). The
// fixtures: #1149's, #1157's, the bolt with an edge in and out sideways (#1151), and the bolt,
// curved trapezoid, bow rect and the documents with four edges each top to bottom.
// Each with the nodes whose side is too short for the layout's `minPitch` between its ends
// (02's filled circle is 14 wide, and its 8.4 of span holds two ends 8 apart, not three), and
// the flow it is also drawn in: the bolt's arrowheads reach it from all four sides.
const SHAPE_THEMES = 'nightly-check/shape-themes';
const SPREAD_FIXTURES: [fixture: string, shared: string[], flow?: string][] = [
  ['baseline/handdrawn/default.mmd', []],
  ['baseline/shapes/bolt.mmd', []],
  ['baseline/shapes/bolt.mmd', [], 'RL'],
  [`${SHAPE_THEMES}/01-connect-all-shapes-with-each-other.mmd`, []],
  [`${SHAPE_THEMES}/02-connect-all-shapes-with-each-other.mmd`, ['n33']],
  [`${SHAPE_THEMES}/02-connect-all-shapes-with-each-other.mmd`, ['n33'], 'BT'],
  [`${SHAPE_THEMES}/03-connect-all-shapes-with-each-other.mmd`, []],
  [`${SHAPE_THEMES}/04-connect-all-shapes-with-each-other.mmd`, []],
  [`${SHAPE_THEMES}/05-connect-all-shapes-with-each-other.mmd`, []],
];

/** The gap the fixture's theme keeps between an arrowhead and the outline. */
async function gapOf(path: string): Promise<number> {
  const named = /\btheme:\s*["']?(\w+)/.exec(readFileSync(path, 'utf8'))?.[1];
  const theme = named && isThemeName(named) ? named : DEFAULT_THEME;
  return createTheme(await loadTheme(theme)).number('arrowheadGap');
}

describe('flowchart edge ends on shapes (#1149, #1157, #1151)', () => {
  it.each(SPREAD_FIXTURES)(
    'ends edges apart and on the outline in %s (shared at %j, flow %s)',
    async (fixture, shared, flow) => {
      const path = join(REPO_ROOT, 'e2e/diagrams/flowchart', fixture);
      const { nodes, edges } = await draw(path, flow);
      const gap = await gapOf(path);
      const ends = new Map<string, { edge: string; p: Pt }[]>();
      const bad: string[] = [];
      for (const e of edges) {
        for (const id of [e.from, e.to]) {
          const node = nodes.get(id);
          if (!node || e.from === e.to) continue;
          let p = id === e.from ? e.start : e.end;
          if (id === e.to && e.tip) {
            // The tip, `gap` on along the line's last stretch, is on the outline.
            const [dx, dy] = [e.tip[0] - e.end[0], e.tip[1] - e.end[1]];
            const len = Math.hypot(dx, dy);
            p = [e.tip[0] + (gap * dx) / len, e.tip[1] + (gap * dy) / len];
          }
          const local: Pt = [p[0] - node.at[0], p[1] - node.at[1]];
          const off = offOutline(node.layers, local);
          if (off > 1) bad.push(`${e.from}>${e.to} at ${id}: ${off.toFixed(2)} px off the outline`);
          const list = ends.get(id) ?? [];
          list.push({ edge: `${e.from}>${e.to}`, p });
          ends.set(id, list);
        }
      }
      for (const [id, list] of ends)
        for (let i = shared.includes(id) ? list.length : 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const [a, b] = [list[i]!, list[j]!];
            if (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 1)
              bad.push(`${a.edge} and ${b.edge} share an end at ${id}`);
          }
      expect(bad).toEqual([]);
    }
  );
});
