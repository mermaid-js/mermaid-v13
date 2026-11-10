// Generated flow diagrams for the agentflow text suites (#551, pitfall 20): nested and
// collapsed flows of every kind of node, flows with their own direction, `global` nodes and a
// connector, nodes outside, and edges of the three kinds (some labelled, some long) between
// members of different flows, from a member to its own flow and back, into and out of flows,
// and between flows, in every direction. Seeded, so the corpus is the same on every run.
import type { CorpusItem } from '../../types.ts';

const KINDS = ['task', 'tool', 'input', 'decision', 'refdoc', 'action'] as const;
const DIRS = ['LR', 'TB', 'RL', 'BT'] as const;

/** A seeded generator (mulberry32), so the fuzz corpus is the same on every run. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` generated flow diagrams. */
export function flowFuzz(count: number, seed = 551): CorpusItem[] {
  const rnd = random(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const items: CorpusItem[] = [];
  for (let n = 0; n < count; n++) {
    const lines = [`agentflow-beta ${pick(DIRS)}`];
    const nodes: string[] = [];
    const flows: string[] = [];
    const membersOf = new Map<string, string[]>();
    let ids = 0;
    const node = (indent: string, flow?: string): void => {
      const id = `n${ids++}`;
      const text = rnd() < 0.2 ? `Node ${id} with a longer label` : `Node ${id}`;
      lines.push(`${indent}${id}["${text}"]@{ shape: ${pick(KINDS)} }`);
      nodes.push(id);
      if (flow) membersOf.get(flow)!.push(id);
    };
    const flow = (indent: string, depth: number): void => {
      const id = `f${flows.length}`;
      flows.push(id);
      membersOf.set(id, []);
      lines.push(`${indent}flow ${id}["Flow ${id}"]`);
      if (rnd() < 0.25) lines.push(`${indent}  direction ${pick(DIRS)}`);
      const members = 1 + Math.floor(rnd() * 3);
      for (let m = 0; m < members; m++) node(`${indent}  `, id);
      if (depth < 2 && rnd() < 0.35) flow(`${indent}  `, depth + 1);
      lines.push(`${indent}end`);
      if (rnd() < 0.15) lines.push(`${indent}${id}@{ view: "collapsed" }`);
    };
    const top = 1 + Math.floor(rnd() * 3);
    for (let f = 0; f < top; f++) flow('  ', 0);
    const outside = Math.floor(rnd() * 3);
    for (let o = 0; o < outside; o++) node('  ');
    if (rnd() < 0.2) {
      lines.push('  global');
      node('    ');
      lines.push('  end');
    }
    if (rnd() < 0.2) {
      const id = `c${ids++}`;
      lines.push(`  connector ${id}["API"]`);
      nodes.push(id);
    }
    const edges = 2 + Math.floor(rnd() * 7);
    for (let e = 0; e < edges; e++) {
      const kind = rnd();
      let a: string;
      let b: string;
      if (kind < 0.15) {
        // A member and its own flow, either way.
        const f = pick(flows);
        const m = pick(membersOf.get(f)!);
        [a, b] = rnd() < 0.5 ? [m, f] : [f, m];
      } else if (kind < 0.3) {
        [a, b] = [pick([...nodes, ...flows]), pick(flows)];
      } else {
        [a, b] = [pick(nodes), pick(nodes)];
      }
      if (a === b) continue;
      const long = rnd() < 0.15;
      const label = rnd() < 0.4 ? `go ${e}` : undefined;
      const op = rnd();
      let link: string;
      // `-.-` takes more dots to be longer (`-..-`), the others more dashes.
      if (op < 0.2) link = long ? '-..-' : '-.-';
      else {
        const head = op < 0.45 ? 'x' : '>';
        const dashes = long ? '---' : '--';
        link = label && rnd() < 0.5 ? `-- ${label} ${dashes}${head}` : `${dashes}${head}`;
        if (label && !link.includes(label)) link += `|${label}|`;
      }
      lines.push(`  ${a} ${link} ${b}`);
    }
    items.push({ id: `fuzz ${n}`, source: lines.join('\n') });
  }
  return items;
}
