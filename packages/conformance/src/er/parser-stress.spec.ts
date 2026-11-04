import { describe, expect, it } from 'vitest';
import { parseEr } from '@mermaid-js/diagram-er';

/**
 * Linear parsing (R-PARSE-7, pitfall 11): statement shapes that repeat a name, a list or a
 * nesting level. The time for 16n stays within a small multiple of the time for n (linear:
 * 16, quadratic: 256), best of 7 after a warm-up run, as in the lexer's `stress.spec.ts`.
 */
const N = 2_000;
const CASES: [string, (n: number) => string][] = [
  ['relationships between two entities', (n) => 'erDiagram\n' + 'A ||--o{ B : x\n'.repeat(n)],
  [
    'relationships to new entities',
    (n) => 'erDiagram\n' + Array.from({ length: n }, (_, i) => `A ||--o{ E${i} : x\n`).join(''),
  ],
  ['attributes of one entity', (n) => 'erDiagram\nA {\n' + 'int x PK, FK "c"\n'.repeat(n) + '}'],
  [
    'a long class list',
    (n) =>
      'erDiagram\nA\nclass A ' + Array.from({ length: n }, (_, i) => `c${i}`).join(',') + ' hot',
  ],
  [
    'subgraphs with many members',
    (n) =>
      'erDiagram\n' +
      Array.from({ length: n }, (_, i) => `subgraph G${i}\nA${i}\nB\nend\n`).join(''),
  ],
  ['nested subgraphs', (n) => 'erDiagram\n' + 'subgraph G\n'.repeat(n) + 'A\n' + 'end\n'.repeat(n)],
  ['descriptions', (n) => 'erDiagram\n' + 'accDescr { x }\n'.repeat(n)],
  ['errors on every line', (n) => 'erDiagram\n' + 'A ||--o{ B\n'.repeat(n)],
  [
    'styles of many entities',
    (n) =>
      'erDiagram\n' + Array.from({ length: n }, (_, i) => `E${i}\nstyle E${i} fill:red\n`).join(''),
  ],
];

function best(src: string): number {
  parseEr(src, { maxDepth: 1e9, maxNodes: 1e9 });
  let min = Infinity;
  for (let k = 0; k < 7; k++) {
    const t0 = performance.now();
    parseEr(src, { maxDepth: 1e9, maxNodes: 1e9 });
    min = Math.min(min, performance.now() - t0);
  }
  return min;
}

describe('ER parser is linear', () => {
  it.each(CASES)('%s', { timeout: 60_000 }, (_, make) => {
    const small = best(make(N));
    const large = best(make(16 * N));
    expect(large / Math.max(small, 0.5)).toBeLessThan(64);
  });
});
