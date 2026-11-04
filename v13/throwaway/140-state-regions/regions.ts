// THROWAWAY PROTOTYPE for #140 (D111). Not product code: nothing imports it, no test runs it,
// and it goes away once the state layout (#144) lands. Findings: v13/docs/research/state-regions.md.
//
// Question: can core's layered engine place `--` concurrency regions side by side inside their
// composite, with only today's LayoutGroup machinery? Each region is a LayoutGroup nested in its
// composite's group, with no edges between regions.
//
// Run: pnpm exec tsx v13/throwaway/140-state-regions/regions.ts [--json] [--svg <dir>]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { layered, validateLayout } from '../../../packages/core/src/layout/index.ts';
import type {
  Dir,
  LayoutEdge,
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  LayoutNode,
} from '../../../packages/core/src/layout/index.ts';

// ---------------------------------------------------------------------------------------------
// A tiny state-diagram reader, just enough for the region fixtures (no state parser exists yet).

interface Scope {
  /** '' for the root, else the composite's id. */
  id: string;
  /** Set once the composite has a `--`. */
  regions?: string[];
}

interface Built {
  graph: LayoutGraph;
  /** Composite id → its region group ids, in declaration order. */
  regions: Map<string, string[]>;
  ignored: string[];
}

const PAD = 8; // v12 state `padding`
const TITLE_H = 18; // composite title band
const SPACING = { node: 50, rank: 50, edge: 20 };
const pad = (): LayoutGroup['padding'] => ({ top: PAD, right: PAD, bottom: PAD, left: PAD });

function textSize(label: string): { width: number; height: number } {
  return { width: Math.max(1, label.length) * 8 + 2 * PAD, height: 24 };
}

function nodeSize(id: string): { width: number; height: number } {
  if (id.endsWith('_start') || id.endsWith('_end')) return { width: 14, height: 14 };
  const s = textSize(id);
  return { width: s.width, height: s.height + 2 * PAD };
}

function build(src: string): Built {
  const body = src.replace(/^---\n[\s\S]*?\n---\n/, '');
  const nodes = new Map<string, LayoutNode>();
  const groups = new Map<string, LayoutGroup>();
  const edges: LayoutEdge[] = [];
  const regions = new Map<string, string[]>();
  const ignored: string[] = [];
  let direction: Dir = 'TB';
  const stack: Scope[] = [{ id: '' }];
  const top = (): Scope => stack[stack.length - 1]!;
  // Where a new member of the current scope goes: the composite's current region, or the
  // composite itself while it has no `--`.
  const home = (): string | undefined => {
    const s = top();
    if (s.id === '') return undefined;
    return s.regions ? s.regions[s.regions.length - 1] : s.id;
  };
  const parentOf = (p: string | undefined): { parent?: string } => (p ? { parent: p } : {});
  const ref = (raw: string, asSource: boolean): string => {
    if (raw === '[*]') {
      const id = `${home() ?? 'root'}_${asSource ? 'start' : 'end'}`;
      if (!nodes.has(id)) nodes.set(id, { id, ...nodeSize(id), ...parentOf(home()) });
      return id;
    }
    if (groups.has(raw)) return raw;
    if (!nodes.has(raw)) nodes.set(raw, { id: raw, ...nodeSize(raw), ...parentOf(home()) });
    return raw;
  };

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%') || line.startsWith('stateDiagram')) continue;
    let m: RegExpExecArray | null;
    if (/^(accTitle|accDescr|classDef|class |note )/.test(line)) {
      ignored.push(line.split(/\s/)[0]!);
      continue;
    }
    if ((m = /^direction\s+(TB|BT|LR|RL)$/.exec(line))) {
      const s = top();
      if (s.id === '') direction = m[1] as Dir;
      else groups.get(s.id)!.direction = m[1] as Dir;
      continue;
    }
    if ((m = /^state\s+(?:"[^"]*"\s+as\s+)?(\S+)\s*\{$/.exec(line))) {
      const id = m[1]!;
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          padding: pad(),
          title: { width: textSize(id).width, height: TITLE_H },
          ...parentOf(home()),
        });
      }
      nodes.delete(id); // referenced before it was opened
      stack.push({ id });
      continue;
    }
    if (line === '}') {
      stack.pop();
      continue;
    }
    if (line === '--') {
      const s = top();
      if (!s.regions) {
        // The members so far form region 0.
        const r0 = `${s.id}/r0`;
        groups.set(r0, { id: r0, parent: s.id, padding: pad() });
        for (const n of nodes.values()) if (n.parent === s.id) n.parent = r0;
        for (const g of groups.values()) if (g.parent === s.id && g.id !== r0) g.parent = r0;
        // Each region keeps its own [*] markers.
        for (const [id, n] of [...nodes]) {
          if (n.parent !== r0 || !/_(start|end)$/.test(id) || !id.startsWith(`${s.id}_`)) continue;
          const nid = `${r0}${id.slice(s.id.length)}`;
          nodes.delete(id);
          nodes.set(nid, { ...n, id: nid });
          for (const e of edges) {
            if (e.source === id) e.source = nid;
            if (e.target === id) e.target = nid;
          }
        }
        s.regions = [r0];
      }
      const rn = `${s.id}/r${s.regions.length}`;
      groups.set(rn, { id: rn, parent: s.id, padding: pad() });
      s.regions.push(rn);
      regions.set(s.id, s.regions);
      continue;
    }
    if ((m = /^(\S+)\s*-->\s*(\S+?)\s*(?::\s*(.*))?$/.exec(line))) {
      const source = ref(m[1]!, true);
      const target = ref(m[2]!, false);
      const e: LayoutEdge = { id: `e${edges.length}`, source, target, minLen: 1 };
      if (m[3]) e.label = textSize(m[3]);
      edges.push(e);
      continue;
    }
    if ((m = /^(\S+)(?:\s*:\s*.*)?$/.exec(line))) {
      ref(m[1]!, true);
      continue;
    }
    ignored.push(line);
  }
  return {
    graph: {
      direction,
      nodes: [...nodes.values()],
      edges,
      groups: [...groups.values()],
      spacing: SPACING,
      diagramPadding: 8,
    },
    regions,
    ignored,
  };
}

// ---------------------------------------------------------------------------------------------
// Region invariants on top of validateLayout.

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  x0: b.x - b.width / 2,
  y0: b.y - b.height / 2,
  x1: b.x + b.width / 2,
  y1: b.y + b.height / 2,
});
const SLACK = 0.5;
const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.min(a1, b1) - Math.max(a0, b0);

/** The direction the composite was asked for: its own, else its nearest ancestor's. */
function intendedDir(b: Built, id: string): Dir {
  const byId = new Map(b.graph.groups.map((g) => [g.id, g]));
  for (let g = byId.get(id); g; g = g.parent ? byId.get(g.parent) : undefined) {
    if (g.direction) return g.direction;
  }
  return b.graph.direction;
}

/**
 * The direction the engine actually uses: v12's rule (core `inheritCrossedDirections`) drops
 * the direction of every group an edge crosses, which then inherits its parent's.
 */
function effectiveDir(b: Built, id: string): Dir {
  const parentOf = parents(b);
  const up = (x: string): Set<string> => {
    const out = new Set<string>();
    for (let p = parentOf.get(x); p; p = parentOf.get(p)) out.add(p);
    return out;
  };
  const stripped = new Set<string>();
  for (const e of b.graph.edges) {
    if (e.source === e.target) continue;
    const a = up(e.source);
    const c = up(e.target);
    for (const g of a) if (!c.has(g)) stripped.add(g);
    for (const g of c) if (!a.has(g)) stripped.add(g);
  }
  const byId = new Map(b.graph.groups.map((g) => [g.id, g]));
  for (let g = byId.get(id); g; g = g.parent ? byId.get(g.parent) : undefined) {
    if (g.direction && !stripped.has(g.id)) return g.direction;
  }
  return b.graph.direction;
}

interface RegionReport {
  /** Hard: validateLayout plus the region invariants. */
  problems: string[];
  /** Soft: order and alignment. */
  notes: string[];
  crashed?: string;
}

function parents(b: Built): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const n of b.graph.nodes) out.set(n.id, n.parent);
  for (const g of b.graph.groups) out.set(g.id, g.parent);
  return out;
}

function checkRegions(b: Built, model: LayoutModel): RegionReport {
  const problems = validateLayout(b.graph, model);
  const notes: string[] = [];
  const g = (id: string): Rect => rectOf(model.groups.get(id)!);
  const parentOf = parents(b);
  const chain = (id: string): string[] => {
    const out: string[] = [];
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) out.push(p);
    return out;
  };

  for (const [comp, regs] of b.regions) {
    const dir = effectiveDir(b, comp);
    const asked = intendedDir(b, comp);
    if (asked !== dir) notes.push(`${comp}: asked for ${asked}, engine uses ${dir} (a crossing edge drops it)`);
    const spreadX = dir === 'TB' || dir === 'BT';
    const rs = regs.map((r) => ({ id: r, ...g(r) }));
    // Side by side across the flow: across-flow intervals disjoint, along-flow intervals shared.
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i]!;
        const c = rs[j]!;
        const ox = overlap(a.x0, a.x1, c.x0, c.x1);
        const oy = overlap(a.y0, a.y1, c.y0, c.y1);
        const acrossOv = spreadX ? ox : oy;
        const alongOv = spreadX ? oy : ox;
        if (acrossOv > SLACK && alongOv > SLACK) {
          problems.push(`regions '${a.id}' and '${c.id}' interleave`);
        } else if (acrossOv > SLACK) {
          problems.push(`regions '${a.id}' and '${c.id}' are stacked along the ${dir} flow`);
        } else if (alongOv <= SLACK) {
          problems.push(`regions '${a.id}' and '${c.id}' share no band across the flow`);
        }
      }
    }
    // Declaration order across the flow (soft: v12's dagre keeps it).
    const key = (r: Rect): number => (spreadX ? r.x0 : r.y0);
    const sorted = [...rs].sort((p, q) => key(p) - key(q));
    if (sorted.map((r) => r.id).join() !== regs.join()) {
      notes.push(`${comp}: regions out of order (${sorted.map((r) => r.id).join(' ')})`);
    }
    // Alignment: equal frames along the flow mean a straight divider with no stretching.
    const near = rs.map((r) => (spreadX ? r.y0 : r.x0));
    const far = rs.map((r) => (spreadX ? r.y1 : r.x1));
    const dn = Math.max(...near) - Math.min(...near);
    const df = Math.max(...far) - Math.min(...far);
    if (dn > SLACK || df > SLACK) {
      notes.push(`${comp}: region frames differ along the flow (start ${dn.toFixed(0)}, end ${df.toFixed(0)})`);
    }
    // Room for a divider between neighbours.
    for (let i = 1; i < sorted.length; i++) {
      const p = sorted[i - 1]!;
      const q = sorted[i]!;
      const gap = spreadX ? q.x0 - p.x1 : q.y0 - p.y1;
      if (gap < 1) problems.push(`${comp}: no room for a divider between '${p.id}' and '${q.id}'`);
    }
  }

  // An edge inside one region stays out of its siblings; a label does not straddle a frame.
  const allRegions = new Set([...b.regions.values()].flat());
  for (const e of b.graph.edges) {
    const placed = model.edges.get(e.id);
    if (!placed) continue;
    const hs = chain(e.source).find((p) => allRegions.has(p));
    const ht = chain(e.target).find((p) => allRegions.has(p));
    if (hs && hs === ht) {
      for (const sib of b.regions.get(parentOf.get(hs)!)!) {
        if (sib === hs) continue;
        const r = g(sib);
        const inside = placed.points.some(
          (p) => p.x > r.x0 + SLACK && p.x < r.x1 - SLACK && p.y > r.y0 + SLACK && p.y < r.y1 - SLACK
        );
        if (inside) problems.push(`edge '${e.id}' (${e.source}→${e.target}) runs into sibling region '${sib}'`);
      }
    }
    // No route through a node that is not one of its ends (sampled every 2 px).
    for (const n of b.graph.nodes) {
      if (n.id === e.source || n.id === e.target) continue;
      const r = rectOf(model.nodes.get(n.id)!);
      let through = false;
      for (let i = 1; i < placed.points.length && !through; i++) {
        const p = placed.points[i - 1]!;
        const q = placed.points[i]!;
        const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 2));
        for (let k = 0; k <= steps && !through; k++) {
          const x = p.x + ((q.x - p.x) * k) / steps;
          const y = p.y + ((q.y - p.y) * k) / steps;
          through = x > r.x0 + SLACK && x < r.x1 - SLACK && y > r.y0 + SLACK && y < r.y1 - SLACK;
        }
      }
      if (through) problems.push(`edge '${e.id}' (${e.source}→${e.target}) runs through node '${n.id}'`);
    }
    if (e.label && placed.label) {
      const l = rectOf({ ...placed.label, ...e.label });
      for (const gr of b.graph.groups) {
        const r = g(gr.id);
        const hit = overlap(l.x0, l.x1, r.x0, r.x1) > SLACK && overlap(l.y0, l.y1, r.y0, r.y1) > SLACK;
        const within =
          l.x0 >= r.x0 - SLACK && l.x1 <= r.x1 + SLACK && l.y0 >= r.y0 - SLACK && l.y1 <= r.y1 + SLACK;
        if (hit && !within) problems.push(`label of '${e.id}' straddles the frame of '${gr.id}'`);
      }
    }
  }
  return { problems, notes };
}

// ---------------------------------------------------------------------------------------------
// Fixtures: every corpus file with `--` inside a composite, plus synthetic stress cases.

const REPO = join(import.meta.dirname, '../../..');

interface Case {
  name: string;
  note: string;
  src: string;
}

function corpus(): Case[] {
  const out: Case[] = [];
  const walk = (d: string): void => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (p.endsWith('.mmd')) {
        const src = readFileSync(p, 'utf8');
        if (/^\s*--\s*$/m.test(src)) out.push({ name: relative(REPO, p), note: 'corpus', src });
      }
    }
  };
  for (const dir of ['e2e/diagrams/state-diagram', 'e2e/diagrams/state-diagram-v2']) walk(join(REPO, dir));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const seq = (prefix: string, n: number): string =>
  Array.from({ length: n - 1 }, (_, i) => `${prefix}${i} --> ${prefix}${i + 1}`).join('\n');
const sd = (...lines: string[]): string => ['stateDiagram-v2', ...lines].join('\n');

const SYNTHETIC: Case[] = [
  { name: 'S1 two regions', note: '2 regions, TB', src: sd('state C {', '[*] --> A', 'A --> B', '--', '[*] --> X', 'X --> Y', '}') },
  {
    name: 'S2 three regions, sizes 1/6/fan',
    note: 'very different sizes',
    src: sd('state C {', 'Only', '--', seq('L', 6), '--', 'F --> F1', 'F --> F2', 'F --> F3', 'F --> F4', '}'),
  },
  {
    name: 'S3 wide vs tall',
    note: 'one long label, one deep chain',
    src: sd('state C {', 'AVeryLongStateNameThatIsWiderThanTheRest --> B', '--', seq('T', 8), '}'),
  },
  {
    name: 'S4 nested composite with regions',
    note: 'regions inside a region',
    src: sd('state Outer {', '[*] --> In', 'state In {', '[*] --> a1', 'a1 --> a2', '--', '[*] --> b1', '}', '--', '[*] --> P', 'P --> Q', '}'),
  },
  {
    name: 'S5 transition into a region',
    note: 'edge from outside to a region member',
    src: sd('state C {', '[*] --> A1', 'A1 --> A2', '--', '[*] --> B1', 'B1 --> B2', '}', 'X --> A2'),
  },
  {
    name: 'S6 transition out of a region',
    note: 'edge from a region member to outside',
    src: sd('state C {', '[*] --> A1', 'A1 --> A2', '--', '[*] --> B1', 'B1 --> B2', '}', 'B2 --> Done'),
  },
  {
    name: 'S7 transition between regions',
    note: 'region 0 to region 1 (not UML; v12 accepts it)',
    src: sd('state C {', '[*] --> A1', 'A1 --> A2', '--', '[*] --> B1', 'B1 --> B2', '}', 'A2 --> B1'),
  },
  {
    name: 'S8 direction LR composite',
    note: 'LR composite in a TB diagram, 3 regions',
    src: sd('[*] --> C', 'state C {', 'direction LR', '[*] --> A1', 'A1 --> A2', '--', '[*] --> B1', 'B1 --> B2', '--', '[*] --> D1', '}', 'C --> [*]'),
  },
  {
    name: 'S9 direction TB composite in LR diagram',
    note: 'TB composite in an LR diagram',
    src: sd('direction LR', '[*] --> C', 'state C {', 'direction TB', '[*] --> A1', 'A1 --> A2', '--', '[*] --> B1', 'B1 --> B2', '}', 'C --> [*]'),
  },
  {
    name: 'S10 LR diagram, composite inherits LR',
    note: 'regions should stack top to bottom',
    src: sd('direction LR', '[*] --> C', 'state C {', '[*] --> A1', 'A1 --> A2', '--', '[*] --> B1', 'B1 --> B2', '}', 'C --> [*]'),
  },
  {
    name: 'S11 LR composite with transition into a region',
    note: 'the crossing edge strips the LR (v12 rule)',
    src: sd('state C {', 'direction LR', 'A1 --> A2', '--', 'B1 --> B2', '}', 'X --> A1'),
  },
  {
    name: 'S12 labels and self-loops in regions',
    note: 'wide labels, self-loop',
    src: sd('state C {', '[*] --> A', 'A --> A : retry the operation', 'A --> B : a long transition label here', '--', '[*] --> X', 'X --> Y : another wide transition label', '}'),
  },
  {
    name: 'S13 four levels, regions at each',
    note: 'regions in a region in a region',
    src: sd('state A {', 'state B {', 'state C {', 'c1', '--', 'c2', '}', '--', 'b2 --> b3', '}', '--', 'a2', '--', 'a3 --> a4', '}'),
  },
  {
    name: 'S14 BT and RL composites',
    note: 'reversed flows',
    src: sd('state U {', 'direction BT', '[*] --> u1', 'u1 --> u2', '--', '[*] --> v1', '}', 'state W {', 'direction RL', '[*] --> w1', 'w1 --> w2', '--', '[*] --> z1', '}', 'U --> W'),
  },
  {
    name: 'S15 edges to the composite and into a region',
    note: 'edge to the composite group plus one to a region member',
    src: sd('[*] --> C', 'state C {', '[*] --> A1', '--', '[*] --> B1', '}', 'X --> B1', 'C --> [*]'),
  },
  {
    name: 'S16 region member to its own composite',
    note: 'edge from inside a region to the composite group',
    src: sd('state C {', '[*] --> A1', 'A1 --> C', '--', '[*] --> B1', '}'),
  },
  {
    name: 'S17 sibling-region edge, bigger regions',
    note: 'W4 straight line past other nodes',
    src: sd('state C {', '[*] --> A1', seq('A', 4), '--', '[*] --> B0', seq('B', 4), '--', seq('D', 3), '}', 'A0 --> D2'),
  },
];

// ---------------------------------------------------------------------------------------------
// Variants: the plain nested-group model, its routing/grid modes, and workarounds that need no
// core change.

type Variant = (b: Built) => Built;

/** For a node or group id, the regions it sits in, innermost first. */
function regionChain(b: Built): (id: string) => string[] {
  const all = new Set([...b.regions.values()].flat());
  const parentOf = parents(b);
  return (id) => {
    const out: string[] = [];
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (all.has(p)) out.push(p);
    return out;
  };
}
const isRegionOrComposite = (b: Built, id: string): boolean =>
  b.regions.has(id) || [...b.regions.values()].some((r) => r.includes(id));

const VARIANTS: Record<string, Variant> = {
  nested: (b) => b,
  'nested, stretched': (b) => b,
  'nested, stepped': (b) => ({ ...b, graph: { ...b.graph, routing: 'stepped' } }),
  // A rough cell profile: px / 8 rounded up, compact spacing (DESIGN §6.3).
  'nested, grid': (b) => {
    const c = (v: number): number => Math.max(1, Math.ceil(v / 8));
    return {
      ...b,
      graph: {
        ...b.graph,
        grid: 1,
        diagramPadding: 0,
        spacing: { node: 2, rank: 4, edge: 1 },
        nodes: b.graph.nodes.map((n) => ({ ...n, width: c(n.width) + 2, height: 3 })),
        edges: b.graph.edges.map((e) => (e.label ? { ...e, label: { width: c(e.label.width), height: 1 } } : e)),
        groups: b.graph.groups.map((g) => ({
          ...g,
          padding: { top: 1, right: 1, bottom: 1, left: 1 },
          ...(g.title ? { title: { width: c(g.title.width), height: 1 } } : {}),
        })),
      },
    };
  },
  // W1: state every composite's and region's direction explicitly (its intended one).
  'W1 explicit directions': (b) => ({
    ...b,
    graph: {
      ...b.graph,
      groups: b.graph.groups.map((g) => (isRegionOrComposite(b, g.id) ? { ...g, direction: intendedDir(b, g.id) } : g)),
    },
  }),
  // W2: an edge that crosses a region frame ends at the outermost region it would enter, so no
  // group loses its direction and the composite level sees a plain edge to a region box.
  'W2 crossing edge to region frame': (b) => {
    const regionsOf = regionChain(b);
    const lift = (end: string, other: string): string => {
      const mine = regionsOf(end);
      const theirs = new Set(regionsOf(other));
      const entered = mine.filter((r) => !theirs.has(r));
      return entered.length ? entered[entered.length - 1]! : end;
    };
    return {
      ...b,
      graph: {
        ...b.graph,
        edges: b.graph.edges.map((e) => ({ ...e, source: lift(e.source, e.target), target: lift(e.target, e.source) })),
      },
    };
  },
  // W3: invisible ordering edges r0 → r1 → … to pin the region order. LayoutEdge has no
  // "same rank" form (minLen is at least 1), so these rank the regions, i.e. stack them.
  'W3 ordering edge r_i→r_i+1': (b) => {
    const extra: LayoutEdge[] = [];
    for (const regs of b.regions.values()) {
      for (let i = 1; i < regs.length; i++) {
        extra.push({ id: `order${extra.length}`, source: regs[i - 1]!, target: regs[i]!, minLen: 1 });
      }
    }
    return { ...b, graph: { ...b.graph, edges: [...b.graph.edges, ...extra] } };
  },
  // W4: see layoutW4.
  'W4 sibling-region edges drawn by the builder': (b) => b,
};

// W4: leave edges between sibling regions out of the engine's graph; the builder draws each as
// a straight line between its two boxes after layout.
function siblingRegionEdges(b: Built): Set<string> {
  const parentOf = parents(b);
  const regionsOf = regionChain(b);
  const out = new Set<string>();
  for (const e of b.graph.edges) {
    const a = regionsOf(e.source);
    const c = regionsOf(e.target);
    // Two different regions of one composite on the two paths: the edge joins siblings.
    if (a.some((r) => c.some((q) => q !== r && parentOf.get(q) === parentOf.get(r)))) out.add(e.id);
  }
  return out;
}

function layoutW4(b: Built): LayoutModel {
  const cut = siblingRegionEdges(b);
  const model = layered({ ...b.graph, edges: b.graph.edges.filter((e) => !cut.has(e.id)) });
  for (const e of b.graph.edges) {
    if (!cut.has(e.id)) continue;
    const box = (id: string): { x: number; y: number; width: number; height: number } =>
      model.nodes.get(id) ?? model.groups.get(id)!;
    const s = box(e.source);
    const t = box(e.target);
    // Clip the centre-to-centre line at each box.
    const clip = (from: typeof s, to: typeof s): { x: number; y: number } => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const k = Math.min(
        dx ? from.width / 2 / Math.abs(dx) : Infinity,
        dy ? from.height / 2 / Math.abs(dy) : Infinity
      );
      return { x: from.x + dx * k, y: from.y + dy * k };
    };
    const p = clip(s, t);
    const q = clip(t, s);
    model.edges.set(e.id, {
      points: [
        { ...p, axis: 'v' },
        { ...q, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'top' },
      ...(e.label ? { label: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } } : {}),
    });
  }
  return model;
}

// Builder post-pass for drawing: stretch each region along the flow to its composite's inner
// extent, so every divider runs the full composite. Safe when every member of a composite sits
// in one of its regions (always true once it has a `--`).
function stretchRegions(b: Built, model: LayoutModel): void {
  for (const [comp, regs] of b.regions) {
    const spreadX = ['TB', 'BT'].includes(effectiveDir(b, comp));
    const rs = regs.map((r) => model.groups.get(r)!);
    const lo = Math.min(...rs.map((r) => (spreadX ? r.y - r.height / 2 : r.x - r.width / 2)));
    const hi = Math.max(...rs.map((r) => (spreadX ? r.y + r.height / 2 : r.x + r.width / 2)));
    for (const r of rs) {
      if (spreadX) {
        r.y = (lo + hi) / 2;
        r.height = hi - lo;
      } else {
        r.x = (lo + hi) / 2;
        r.width = hi - lo;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------

function svg(b: Built, m: LayoutModel): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}" font-family="monospace" font-size="10">`,
    `<rect width="100%" height="100%" fill="white"/>`,
  ];
  const all = new Set([...b.regions.values()].flat());
  for (const g of b.graph.groups) {
    const r = rectOf(m.groups.get(g.id)!);
    const dash = all.has(g.id) ? ' stroke-dasharray="4 3" stroke="#c33"' : ' stroke="#333"';
    out.push(`<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}" fill="none"${dash}/>`);
    out.push(`<text x="${r.x0 + 3}" y="${r.y0 + 11}">${g.id}</text>`);
  }
  for (const n of b.graph.nodes) {
    const r = rectOf(m.nodes.get(n.id)!);
    out.push(`<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}" rx="5" fill="#eef" stroke="#336"/>`);
    out.push(`<text x="${r.x0 + 3}" y="${(r.y0 + r.y1) / 2 + 3}">${n.id.replace(/^.*\//, '')}</text>`);
  }
  for (const e of b.graph.edges) {
    const p = m.edges.get(e.id)!;
    out.push(`<polyline points="${p.points.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#090"/>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const svgDir = args.includes('--svg') ? args[args.indexOf('--svg') + 1] : undefined;
  const cases = [...corpus(), ...SYNTHETIC];
  const rows: { name: string; note: string; results: Record<string, RegionReport> }[] = [];
  for (const c of cases) {
    const results: Record<string, RegionReport> = {};
    for (const [vn, v] of Object.entries(VARIANTS)) {
      const b = v(build(c.src));
      try {
        const model = vn.startsWith('W4') ? layoutW4(b) : layered(b.graph);
        if (vn.includes('stretched')) stretchRegions(b, model);
        results[vn] = checkRegions(b, model);
        if (svgDir) {
          mkdirSync(svgDir, { recursive: true });
          const file = `${c.name.replace(/[^\w]+/g, '_')}__${vn.replace(/[^\w]+/g, '_')}.svg`;
          writeFileSync(join(svgDir, file), svg(b, model));
        }
      } catch (err) {
        results[vn] = { problems: [], notes: [], crashed: String(err) };
      }
    }
    rows.push({ name: c.name, note: c.note, results });
  }
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  for (const r of rows) {
    console.log(`\n## ${r.name}  (${r.note})`);
    for (const [vn, rep] of Object.entries(r.results)) {
      const verdict = rep.crashed ? 'CRASH' : rep.problems.length ? 'FAIL' : 'pass';
      console.log(`  ${vn.padEnd(34)} ${verdict}`);
      if (rep.crashed) console.log(`      ! ${rep.crashed}`);
      for (const p of rep.problems) console.log(`      - ${p}`);
      for (const n of rep.notes) console.log(`      ~ ${n}`);
    }
  }
}

main();
