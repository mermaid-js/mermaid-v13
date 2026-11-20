// Seeded block diagrams for the ASCII properties (#559, pitfall 20): composites nested up to
// three deep with `columns`, spans, spaces and block arrows, and edges with labels between any
// two blocks (composites, a composite and its own child, a block and itself), every kind of
// line and arrowhead. Deterministic: the same seed gives the same sources.

import { seededRandom } from '@mermaid-js/shared/random';

const LINKS = ['-->', '---', '<-->', '==>', '-.->', '--x', '--o', '<==>', '-.-'];
const LABELS = ['a', 'go', 'yes', 'no way', 'a much longer edge label'];
const NAMES = ['x', 'Box', 'Two words', 'A label that runs on for quite a while longer than forty'];

/** `n` sources. */
export function nestedComposites(n: number, seed = 559): string[] {
  const rnd = seededRandom(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const ids: string[] = [];
    let next = 0;
    const lines: string[] = ['block'];
    const body = (depth: number, indent: string): void => {
      if (rnd() < 0.6) lines.push(`${indent}columns ${1 + Math.floor(rnd() * 4)}`);
      const count = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < count; i++) {
        const id = `n${next++}`;
        const r = rnd();
        const span = rnd() < 0.2 ? `:${2 + Math.floor(rnd() * 2)}` : '';
        if (depth < 3 && r < 0.3) {
          ids.push(id);
          const label = rnd() < 0.5 ? `["${pick(NAMES)}"]` : '';
          lines.push(`${indent}block:${id}${label}${span}`);
          body(depth + 1, `${indent}  `);
          lines.push(`${indent}end`);
        } else if (r < 0.4) {
          lines.push(`${indent}space${rnd() < 0.5 ? `:${1 + Math.floor(rnd() * 3)}` : ''}`);
        } else if (r < 0.5) {
          ids.push(id);
          lines.push(
            `${indent}${id}<["${pick(NAMES)}"]>(${pick(['right', 'left', 'up', 'down', 'x', 'y'])})`
          );
        } else {
          ids.push(id);
          lines.push(`${indent}${id}["${pick(NAMES)}"]${span}`);
        }
      }
    };
    body(0, '  ');
    const edges = Math.floor(rnd() * 5);
    for (let i = 0; i < edges && ids.length > 0; i++) {
      const a = pick(ids);
      const b = rnd() < 0.1 ? a : pick(ids);
      const link = pick(LINKS);
      const label = rnd() < 0.4 && link === '-->' ? `-- "${pick(LABELS)}" -->` : link;
      lines.push(`  ${a} ${label} ${b}`);
    }
    out.push(lines.join('\n'));
  }
  return out;
}
