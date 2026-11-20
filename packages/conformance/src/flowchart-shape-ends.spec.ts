import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// The edges of tri, flip-tri, procs and docs end on their outlines (#395, #403): drawn through
// `createMermaid().render()`, every edge end at one of them lies within 1 px of the outline the
// node draws (the topmost layer's edge of a stack, not a layer's inner edge).
const FIXTURE = join(REPO_ROOT, 'e2e/diagrams/flowchart/visual-check/triangle-and-stack-edges.mmd');
const SHAPED = ['t', 'f', 's', 'u'];

type Pt = readonly [number, number];

const num = (s: string): number[] => s.trim().split(/[ ,]+/).map(Number);

/** A path of M, L, Q and Z commands as points, each curve in 40 steps. */
function flatten(d: string): Pt[] {
  const out: Pt[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLQ])([^MLQZ]*)/g)) {
    const n = num(args!);
    const last = out.at(-1)!;
    if (cmd === 'Q') {
      for (let k = 1; k <= 40; k++) {
        const u = k / 40;
        const b = (i: number): number =>
          (1 - u) ** 2 * last[i]! + 2 * (1 - u) * u * n[i]! + u ** 2 * n[i + 2]!;
        out.push([b(0), b(1)]);
      }
    } else out.push([n[0]!, n[1]!]);
  }
  return out;
}

/** The outlines in a node's markup before its label, in the node's own coordinates. */
function layersOf(markup: string): Pt[][] {
  const shift: Pt[] = [[0, 0]];
  const layers: Pt[][] = [];
  for (const m of markup.matchAll(/<(\/?)(g|polygon|rect|path)\b([^>]*)>/g)) {
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
      layers.push([at([x!, y!]), at([x! + w!, y!]), at([x! + w!, y! + h!]), at([x!, y! + h!])]);
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

describe('flowchart tri, flip-tri, procs and docs edge ends (#395, #403)', () => {
  it('ends every edge on the drawn outline within 1 px', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const { svg } = await m.render('mermaid-0', readFileSync(FIXTURE, 'utf8'));
    const nodes = new Map<string, { at: Pt; layers: Pt[][] }>();
    for (const n of svg.matchAll(
      /<g class="node [^"]*" data-id="([^"]+)"[^>]*transform="translate\(([^)]*)\)">([\s\S]*?)<text/g
    )) {
      const [x, y] = num(n[2]!);
      nodes.set(n[1]!, { at: [x!, y!], layers: layersOf(n[3]!) });
    }
    const found: { from: string; to: string; line: Pt; tip: Pt }[] = [];
    for (const e of svg.matchAll(
      /<g class="edge [^"]*" data-id="[^"]*" data-ast="e:([^&"]+)&gt;([^"]+)">(.*?)<\/g>/g
    )) {
      const line = /<path d="([^"]*)"/.exec(e[3]!)![1]!;
      const head = /class="marker" d="M([^LZ]*)/.exec(e[3]!)![1]!;
      const [lx, ly] = num(/^M([^A-Z]*)/.exec(line)![1]!);
      found.push({ from: e[1]!, to: e[2]!, line: [lx!, ly!], tip: num(head) as unknown as Pt });
    }
    // The arrowhead stops short of the outline by a fixed gap: measured on a plain rectangle.
    const rectEnd = found.find((f) => !SHAPED.includes(f.to))!;
    const rect = nodes.get(rectEnd.to)!;
    const gap = rect.at[0] + rect.layers[0]![0]![0] - rectEnd.tip[0];
    expect(gap).toBeGreaterThan(0);
    let checked = 0;
    for (const f of found) {
      for (const id of [f.from, f.to]) {
        const node = nodes.get(id);
        if (!node || !SHAPED.includes(id)) continue;
        // The source end is the line's start; the target end is the tip, `gap` further on.
        const p: Pt = id === f.to ? [f.tip[0] + gap, f.tip[1]] : f.line;
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
