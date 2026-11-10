import { describe, expect, it } from 'vitest';
import { requirementLanguage } from '@mermaid-js/diagram-requirement/language';

/**
 * R-LANG-4, R-PARSE-7: completion is linear in the number of boxes whatever their names are.
 * Names that need quotes (`"r#1 & 1%"`) are decided without a parse each, and the keyword-like
 * words a bare name could be are parsed once per word. Shape from `../pie/stress.spec.ts`: n and 8n
 * boxes, a probe parse and the completions at a relation end; linear is ~8x, quadratic ~64x,
 * and the bar is 24x. Then the name mix: 2,000 boxes whose names need quotes cost no more than
 * three times 2,000 bare names (a parse per quoted name was ~10x). Times are this thread's CPU
 * time, best of five, alternating.
 */
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

const best = (runs: readonly [() => unknown, () => unknown]): [number, number] => {
  const out: [number, number] = [Infinity, Infinity];
  for (let round = 0; round < 5; round++) {
    out[0] = Math.min(out[0], cost(runs[0]));
    out[1] = Math.min(out[1], cost(runs[1]));
  }
  return out;
};

const SHAPES: [string, (i: number) => string][] = [
  ['names with #, & and %', (i) => `"r#${i} & ${i}%"`],
  ['names with blanks', (i) => `"req number ${i}"`],
  ['bare names', (i) => `r${i}`],
  ['names that start with a keyword', (i) => `"test ${i}"`],
];

function diagram(n: number, name: (i: number) => string): string {
  let text = 'requirementDiagram\n';
  for (let i = 0; i < n; i++) {
    text += `requirement ${name(i)} {\n  id: ${i}\n}\nelement ${name(n + i)} {\n}\n`;
  }
  return `${text}x - satisfies -> `;
}

function complete(text: string): number {
  const result = requirementLanguage.parse(text, { keepTokens: true, probe: text.length });
  return requirementLanguage.completions(result.probe!, { text, result }).length;
}

describe('stress: requirement completion is linear in the boxes', () => {
  it.each(SHAPES)(
    '%s',
    (_name, name) => {
      const small = diagram(250, name);
      const large = diagram(2000, name);
      expect(complete(small)).toBeGreaterThan(250);
      expect(complete(large)).toBeGreaterThan(2000);
      const [tSmall, tLarge] = best([() => complete(small), () => complete(large)]);
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );

  it('costs the same whatever the names are', () => {
    const quoted = diagram(2000, SHAPES[0]![1]);
    const bare = diagram(2000, SHAPES[2]![1]);
    complete(quoted);
    complete(bare);
    const [tQuoted, tBare] = best([() => complete(quoted), () => complete(bare)]);
    expect(tQuoted / Math.max(tBare, 2)).toBeLessThan(3);
  });
});
