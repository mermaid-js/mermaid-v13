import { describe, expect, it } from 'vitest';
import { parseTreeView } from '@mermaid-js/diagram-treeview';

/**
 * R-PARSE-7, pitfall 5: the treeView parser, value conversion, tree building, warnings and
 * box-drawing diagnostics included, is linear in input size. v12's bare-name trim
 * (`/[\t ]+$/`) and accDescr converter (`/\s+$/gm`) are quadratic on a long blank run inside a
 * line; here the paths of AST ids, the nesting stack, the one-warning-per-line lists and
 * recovery must not be. Same frame as `stress.spec.ts`: n and 8n units, best of five, bar 24x
 * (linear ~8x, quadratic ~64x). Not measured on a steady machine: the bar is a ratio.
 */
const H = 'treeView-beta\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blanks inside a bare name', (n) => `${H}a${' '.repeat(n)}b`],
  ['trailing blanks of a bare name', (n) => `${H}a${' '.repeat(n)}\nb`],
  ['blanks inside a description', (n) => `${H}a ## d${' '.repeat(n)}e`],
  ['blanks inside an accDescr block line', (n) => `${H}accDescr {a${' '.repeat(n)}b}\n  a`],
  ['blank lines inside an accDescr block', (n) => `${H}accDescr {a${' \n'.repeat(n / 2)}b}`],
  ['blank runs in a title', (n) => `${H}title a${'  b'.repeat(n / 3)}\n  a`],
  ['many files', (n) => `${H}src/\n` + '  index.js\n'.repeat(n / 11)],
  ['many files of one name', (n) => `${H}src/\n` + '  a\n'.repeat(n / 4)],
  [
    'deep nesting',
    (n) => {
      let out = H;
      for (let d = 0; out.length < n; d++) out += `${' '.repeat(d)}d/\n`;
      return out;
    },
  ],
  [
    'deep box drawing',
    (n) => {
      let out = H;
      for (let d = 0; out.length < n; d++) out += `${'│   '.repeat(d)}├── d/\n`;
      return out;
    },
  ],
  ['annotations on every node', (n) => H + 'a :::hl icon(x) ## d\n'.repeat(n / 21)],
  ['annotations on the next line', (n) => H + 'a\n  :::hl\n'.repeat(n / 10)],
  ['nodes on one line', (n) => H + '"a" '.repeat(n / 4) + 'z'],
  ['nodes indented by trailing blanks', (n) => H + '"s" \n'.repeat(n / 5)],
  ['an error on every line', (n) => H + 'a\n:::x\n'.repeat(n / 7)],
  ['a stray blank on every line', (n) => H + '"a" \n  \n'.repeat(n / 7)],
  ['a box error on every line', (n) => `${H}├── a\n` + '├──\n'.repeat(n / 4)],
  ['a long quoted name', (n) => `${H}"${'a'.repeat(n)}"`],
  ['an unclosed quote on every line', (n) => H + '  "a\n'.repeat(n / 5)],
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

describe('stress: the treeView parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseTreeView(small); // warm up
      parseTreeView(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseTreeView(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseTreeView(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
