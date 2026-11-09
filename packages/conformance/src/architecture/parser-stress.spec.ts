import { describe, expect, it } from 'vitest';
import { parseArchitecture } from '@mermaid-js/diagram-architecture';

/**
 * R-PARSE-7, pitfall 5 and 11: the architecture parser, value conversion, v12's DB checks and the
 * symbol pass included, is linear in input size. Ids resolve through maps (an edge, an `in` and
 * an align member are lookups, not scans), an alignment's repeats through a set, and one
 * warning gathers every ignored `{group}`. Same frame as `stress.spec.ts`: n and 8n units, best
 * of five, bar 24x (linear ~8x, quadratic ~64x). Not measured on a steady machine: the bar is a
 * ratio.
 */
const ids = (n: number, prefix = 's') => Array.from({ length: n }, (_, k) => `${prefix}${k}`);
const services = (list: readonly string[], tail = '') =>
  list.map((id) => `service ${id}(server)[${id}]${tail}`).join('\n');

const SHAPES: [string, (n: number) => string][] = [
  [
    'blanks inside an accDescr block line',
    (n) => `architecture-beta\naccDescr {a${' '.repeat(n)}b}`,
  ],
  [
    'blank lines inside an accDescr block',
    (n) => `architecture-beta\naccDescr {a${' \n'.repeat(n / 2)}b}`,
  ],
  ['blank runs in a title', (n) => `architecture-beta\ntitle a${'  b'.repeat(n / 3)}`],
  ['escaped quotes in a label', (n) => `architecture-beta\nservice a["${'\\"'.repeat(n / 2)}"]`],
  ['a long label', (n) => `architecture-beta\nservice a[${'word '.repeat(n / 5)}]`],
  ['many services', (n) => `architecture-beta\n${services(ids(n / 24))}`],
  [
    'a chain of nested groups',
    (n) => {
      const g = ids(n / 16, 'g');
      return `architecture-beta\ngroup g0\n${g
        .slice(1)
        .map((id, k) => `group ${id} in g${k}`)
        .join('\n')}`;
    },
  ],
  [
    'a chain of edges',
    (n) => {
      const s = ids(n / 40);
      const edges = s.slice(1).map((id, k) => `s${k}:R --> L:${id}`);
      return `architecture-beta\n${services(s)}\n${edges.join('\n')}`;
    },
  ],
  [
    'fan-in to one service',
    (n) => {
      const s = ids(n / 40);
      const edges = s.map((id) => `${id}:R -- L:hub`);
      return `architecture-beta\nservice hub\n${services(s)}\n${edges.join('\n')}`;
    },
  ],
  [
    'the same pair many times',
    (n) => `architecture-beta\nservice a\nservice b\n${'a:R -[x]- L:b\n'.repeat(n / 15)}`,
  ],
  [
    'one alignment over many services',
    (n) => {
      const s = ids(n / 30);
      return `architecture-beta\n${services(s)}\nalign row ${s.join(' ')}`;
    },
  ],
  [
    'services in many groups, edges between groups',
    (n) => {
      const g = ids(n / 60, 'g');
      const decl = g.map((id) => `group ${id}\nservice ${id}s in ${id}`).join('\n');
      const edges = g.slice(1).map((id, k) => `g${k}s{group}:R -- L:${id}s{group}`);
      return `architecture-beta\n${decl}\n${edges.join('\n')}`;
    },
  ],
  ['a duplicate id on every line', (n) => `architecture-beta\n${'service a\n'.repeat(n / 10)}`],
  [
    'edges to unknown ids',
    (n) =>
      `architecture-beta\nservice a\n${ids(n / 14, 'x')
        .map((id) => `a:R -- L:${id}`)
        .join('\n')}`,
  ],
  [
    'ignored {group} on every edge',
    (n) => `architecture-beta\nservice a\nservice b\n${'a{group}:R -- L:b\n'.repeat(n / 18)}`,
  ],
  [
    'a syntax error on every line',
    (n) => `architecture-beta\n${'service Backend\n'.repeat(n / 16)}`,
  ],
];

const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown): number => {
  const t0 = cpuMs();
  run();
  return cpuMs() - t0;
};

describe('stress: the architecture parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseArchitecture(small); // warm up
      parseArchitecture(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseArchitecture(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseArchitecture(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
