import { describe, expect, it } from 'vitest';
import { detectTreeView, treeViewLanguage } from '@mermaid-js/diagram-treeview/language';
import { createLanguageService } from '@mermaid-js/language-service';

/**
 * R-LANG-4, R-PARSE-7 (#576): hover and completion on a treeView are linear in input size. A
 * node's path is built by walking its parents only when hover asks, so a deep chain of long
 * names costs its depth per query, not depth × nodes; completion reads the icon options without
 * the tree. Each query runs at the deepest (last) node after an `update`, whose parse is not
 * timed. Same frame as `parser-stress.spec.ts`: n and 8n characters, best of five, CPU time, bar
 * 24x (linear ~8x, quadratic ~64x). Not measured on a steady machine: the bar is a ratio.
 */
const H = 'treeView-beta\n';
const SHAPES: [string, (n: number) => string][] = [
  [
    'a deep chain of long names',
    (n) => {
      let out = H;
      for (let d = 0; out.length < n; d++) out += `${' '.repeat(d)}${'d'.repeat(40)}${d}/\n`;
      return out;
    },
  ],
  [
    'a deep box-drawn chain',
    (n) => {
      let out = H;
      for (let d = 0; out.length < n; d++) out += `${'│   '.repeat(d)}├── dir${d}/\n`;
      return out;
    },
  ],
  [
    // Depth and name length both grow with the text: paths of all nodes would be superlinear.
    'many deep files with long names',
    (n) => {
      const d = Math.round(Math.sqrt(n) / 4);
      let out = H;
      for (let k = 0; k < d; k++) out += `${' '.repeat(k)}${'p'.repeat(d)}/\n`;
      while (out.length < n) out += `${' '.repeat(d)}${'f'.repeat(d)}${out.length}/\n`;
      return out;
    },
  ],
  ['many files with icons', (n) => `${H}src/\n` + '  a.ts icon(logos:react)\n'.repeat(n / 25)],
];

const service = createLanguageService({
  facets: [
    {
      type: 'treeView',
      id: 'treeView',
      detector: (t) => detectTreeView(t),
      facet: treeViewLanguage,
    },
  ],
});

const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};

/**
 * The CPU time of hover and completion at the last node of `text`, the first queries after a
 * parse (what the facet builds per parse is timed too, the parse itself not), best of five.
 */
function queries(text: string): number {
  const at = text.lastIndexOf('/\n') - 1;
  let best = Infinity;
  for (let round = 0; round < 5; round++) {
    // A new text each round, so the service parses again and no facet cache holds.
    const t = `${text}%% ${round}\n`;
    const doc = service.update('stress:///tree.mmd', t);
    doc.diagnostics();
    const t0 = cpuMs();
    if (doc.hover(at) === undefined) throw new Error('no hover');
    doc.completions(at);
    best = Math.min(best, cpuMs() - t0);
  }
  return best;
}

describe('stress: treeView hover and completion are linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      queries(small); // warm up
      const tSmall = queries(small);
      const tLarge = queries(large);
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );
});
