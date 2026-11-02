import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig } from './index.ts';

/**
 * Flowchart edge bends through the public API: a default edge (and `curve: rounded`) is
 * straight segments joined by circular arcs of radius 5, as v12's `rounded` curve drew them,
 * with the radius clamped where a segment is too short for it. Explicit curves keep their look.
 */
const CORNERED = 'flowchart TD\n  A --> B & C\n  B --> D\n  C --> D\n  A --> D\n';

async function edgePaths(text: string, config?: InitializeConfig): Promise<string[]> {
  const m = createMermaid();
  if (config) m.initialize(config);
  const { svg } = await m.render('bends', text);
  return [...svg.matchAll(/<path d="([^"]+)"[^>]*fill="none"/g)].map((x) => x[1]!);
}

interface Command {
  op: string;
  args: number[];
}

function commands(d: string): Command[] {
  return [...d.matchAll(/([MLCQAZ])([^MLCQAZ]*)/g)].map((m) => ({
    op: m[1]!,
    args: m[2]!.trim() === '' ? [] : m[2]!.trim().split(/[ ,]+/).map(Number),
  }));
}

interface Arc {
  r: number;
  /** The straight runs into and out of the arc. */
  before: number;
  after: number;
}

/**
 * Every arc in a path, checked to be a quarter circle that turns tangentially between two
 * straight, axis-aligned runs. Two arcs may meet where a leg is used up by both.
 */
function arcs(d: string): Arc[] {
  const cmds = commands(d);
  expect(cmds[0]!.op).toBe('M');
  for (const c of cmds) {
    expect(['M', 'L', 'A']).toContain(c.op);
    for (const n of c.args) expect(Number.isFinite(n)).toBe(true);
  }
  const pts = cmds.map((c) => [c.args.at(-2)!, c.args.at(-1)!] as const);
  const found: Arc[] = [];
  // The way the path is heading, and the straight run it has just drawn.
  let dir: [number, number] = [0, 0];
  let run = 0;
  let open: Arc | undefined;
  cmds.forEach((c, i) => {
    if (i === 0) return;
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (c.op === 'L') {
      // Straight runs are along one axis, and carry on the way an arc left off.
      expect(Math.abs(dx) > 0.01 && Math.abs(dy) > 0.01).toBe(false);
      run = Math.hypot(dx, dy);
      const next: [number, number] = [Math.sign(dx), Math.sign(dy)];
      if (open) {
        expect(next).toEqual(dir);
        open.after = run;
        open = undefined;
      }
      dir = next;
      return;
    }
    const [rx, ry, rot, large, sweep] = c.args;
    expect(rx).toBe(ry);
    expect([rot, large]).toEqual([0, 0]);
    expect(Math.abs(Math.abs(dx) - rx!)).toBeLessThan(0.02);
    expect(Math.abs(Math.abs(dy) - rx!)).toBeLessThan(0.02);
    const [ux, uy] = dir;
    expect(Math.abs(ux) + Math.abs(uy)).toBe(1);
    // It leaves along the other axis, and sweeps the way it turns (y grows downward).
    const v: [number, number] = ux === 0 ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    expect(sweep).toBe(ux * v[1] - uy * v[0] > 0 ? 1 : 0);
    if (open) open.after = 0;
    open = { r: rx!, before: cmds[i - 1]!.op === 'A' ? 0 : run, after: Infinity };
    found.push(open);
    dir = v;
    run = 0;
  });
  return found;
}

describe('flowchart edge bends', () => {
  it('rounds the corners of a default edge with arcs of radius 5', async () => {
    const paths = await edgePaths(CORNERED);
    const all = paths.flatMap(arcs);
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all.every((a) => a.r === 5)).toBe(true);
    // The A --> D edge goes around B: four corners.
    expect(paths.filter((d) => commands(d).filter((c) => c.op === 'A').length === 4)).toHaveLength(
      1
    );
  });

  it('draws `curve: rounded` the same as the default', async () => {
    const rounded = await edgePaths(CORNERED, { flowchart: { curve: 'rounded' } });
    expect(rounded).toEqual(await edgePaths(CORNERED));
  });

  it('clamps the radius so the arcs fit a short jog', async () => {
    const text = [
      'flowchart LR',
      '  subgraph left [Left]',
      '    a1',
      '    a2',
      '  end',
      '  subgraph right [Right]',
      '    b1',
      '    b2',
      '  end',
      '  a1 --> b2',
      '  a2 --> b1',
      '  b1 --> a1',
      '  a2 --> b2',
      '',
    ].join('\n');
    const all = (await edgePaths(text)).flatMap(arcs);
    const clamped = all.filter((a) => a.r < 5);
    expect(clamped.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(a.r).toBeGreaterThan(0);
      expect(a.r).toBeLessThanOrEqual(5);
    }
    // A clamped arc takes a leg it shares with the next corner halfway: the two arcs meet.
    for (const a of clamped) expect(Math.min(a.before, a.after)).toBeLessThan(0.02);
  });

  it('keeps the arrowhead attached to and in line with the last segment', async () => {
    const m = createMermaid();
    const { svg } = await m.render('bends', CORNERED);
    const ad = [...svg.matchAll(/<path d="([^"]+)"[^>]*fill="none"/g)][4]![1]!;
    const cmds = commands(ad);
    const [x, y] = cmds.at(-1)!.args.slice(-2) as [number, number];
    const [px, py] = cmds.at(-2)!.args.slice(-2) as [number, number];
    expect(cmds.at(-1)!.op).toBe('L');
    expect(px).toBe(x);
    // The marker after this path starts where the line stops and points the same way.
    const tail = svg.slice(svg.indexOf(ad));
    const marker = /class="marker" d="M([\d.]+),([\d.]+)L/.exec(tail)!;
    expect(Number(marker[1])).toBe(x);
    expect(Number(marker[2])).toBeGreaterThan(y);
    expect(Number(marker[2]) - y).toBeLessThan(8);
    expect(py).toBeLessThan(y);
  });

  it('leaves explicit curves as they were', async () => {
    expect(await edgePaths(CORNERED, { flowchart: { curve: 'basis' } })).toEqual([
      'M262,48.1C262,66.6 84,66.6 84,85.1L84,91.1',
      'M286,48.1L286,91.1',
      'M84,138.2C84,156.7 262,156.7 262,175.2L262,181.2',
      'M286,138.2L286,181.2',
      'M310,48.1C310,73.1 397,73.1 397,98.1L397,138.2C397,156.7 310,156.7 310,175.2L310,181.2',
    ]);
    expect(await edgePaths(CORNERED, { flowchart: { curve: 'linear' } })).toEqual([
      'M262,48.1L90.74,96.21',
      'M286,48.1L286,91.1',
      'M84,138.2L255.26,186.31',
      'M286,138.2L286,181.2',
      'M310,48.1L397,98.1L397,138.2L316.07,184.71',
    ]);
    expect(await edgePaths(CORNERED, { flowchart: { curve: 'step' } })).toEqual([
      'M262,48.1L262,61.1Q262,73.1 250,73.1L96,73.1Q84,73.1 84,85.1L84,91.1',
      'M286,48.1L286,91.1',
      'M84,138.2L84,151.2Q84,163.2 96,163.2L250,163.2Q262,163.2 262,175.2L262,181.2',
      'M286,138.2L286,181.2',
      'M310,48.1L310,61.1Q310,73.1 322,73.1L385,73.1Q397,73.1 397,85.1L397,151.2Q397,163.2 385,163.2L322,163.2Q310,163.2 310,175.2L310,181.2',
    ]);
  });
});
