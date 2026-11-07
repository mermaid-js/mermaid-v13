import { describe, expect, it } from 'vitest';
import { kanbanTokens, parseKanban } from '@mermaid-js/diagram-kanban';

/**
 * R-PARSE-7, pitfall 5: the kanban lexer is linear in input size, in every free-text state.
 * Shape copied from `../mindmap/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic
 * ~64x, and the bar is 24x. Times are this thread's CPU time, and small and large lexes
 * alternate.
 */
const KB = 'kanban\n  todo\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blank lines', (n) => KB + '\n'.repeat(n) + '    a'],
  ['blanks and line breaks', (n) => KB + ' \n'.repeat(n / 2) + '    a'],
  ['a long indent', (n) => KB + ' '.repeat(n) + 'a'],
  ['a line break, then a long indent', (n) => KB + '\n' + ' '.repeat(n) + 'a'],
  ['trailing blanks on every line', (n) => KB + ('    a' + ' '.repeat(30) + '\n').repeat(n / 36)],
  ['blanks then a percent comment', (n) => KB + ' '.repeat(n) + '%% c'],
  ['bare percent lines', (n) => KB + '%%\n'.repeat(n / 3)],
  ['percent comments after closers', (n) => KB + '    a(b) %% c\n'.repeat(n / 14)],
  ['a long id', (n) => KB + '    ' + 'a b'.repeat(n / 3)],
  ['a long multi-line label', (n) => KB + '    a(' + 'x\n'.repeat(n / 2) + ')'],
  ['an unclosed label', (n) => KB + '    a[' + 'x '.repeat(n / 2)],
  ['a label split by comment lines', (n) => KB + '    a(' + 'x\n%% c\n'.repeat(n / 7) + ')'],
  ['braces in labels', (n) => KB + '    a(b}c d}e)\n'.repeat(n / 16)],
  ['a long string', (n) => KB + '    a["' + 'x\n'.repeat(n / 2) + '"]'],
  ['an unclosed markdown string', (n) => KB + '    a["`' + 'x '.repeat(n / 2)],
  ['a long icon', (n) => KB + '    ::icon(' + 'x\n'.repeat(n / 2)],
  ['a long class', (n) => KB + '    :::' + 'x'.repeat(n)],
  ['bare class markers', (n) => KB + ':::\n'.repeat(n / 4)],
  ['shapes on one line', (n) => KB + '    ' + 'a(b)'.repeat(n / 4)],
  ['entities', (n) => KB + '    a[' + '#a;'.repeat(n / 3) + ']'],
  ['CRLF lines', (n) => KB + '    a\r\n'.repeat(n / 7)],
  ['CRLF lines split by comment lines', (n) => KB + '    a\r\n%% c\r\n'.repeat(n / 13)],
  // Shape data: long blocks, quoted runs, line breaks in them, and many blocks.
  ['long shape data', (n) => KB + '    a@{ ' + 'k: v\n'.repeat(n / 5) + '}'],
  ['unclosed shape data', (n) => KB + '    a@{ ' + 'k: v '.repeat(n / 5)],
  ['a long quoted run', (n) => KB + '    a@{ label: "' + 'x\n  '.repeat(n / 4) + '" }'],
  ['an unclosed quoted run', (n) => KB + '    a@{ label: "' + 'x '.repeat(n / 2)],
  ['many quotes', (n) => KB + '    a@{ ' + '"x"'.repeat(n / 3) + ' }'],
  ['carets in shape data', (n) => KB + '    a@{ ' + 'x^'.repeat(n / 2) + ' }'],
  ['many cards with data', (n) => KB + '    a@{ ticket: T-1, priority: High }\n'.repeat(n / 40)],
  [
    'shape data split by comment lines',
    (n) => KB + '    a@{\n' + '  k: v\n%% c\n'.repeat(n / 13) + '}',
  ],
  ['lone at signs', (n) => KB + '    ' + 'a@'.repeat(n / 2)],
  // A dropped `;` and many removed spans: each token's text is read across the cut text (at 16x
  // size, where a walk over every run per token shows).
  [
    'a style line, then CRLF lines split by comment lines',
    (n) => KB + '    style a:#f;\r\n' + '    a\r\n%% c\r\n'.repeat(n),
  ],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
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

describe('stress: the kanban lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      kanbanTokens(small); // warm up
      kanbanTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => kanbanTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => kanbanTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});

/** Lines until the text is about `n` characters long. */
const lines = (n: number, line: (k: number) => string): string => {
  let out = KB;
  for (let k = 0; out.length < n; k++) out += line(k) + '\n';
  return out;
};

/**
 * R-PARSE-7, pitfall 19: the parser (columns, YAML reads, AST ids, statement spans, symbols,
 * recovery)
 * is linear in input size, with the same n and 8n ratio test as the lexer.
 */
const PARSE_SHAPES: [string, (n: number) => string][] = [
  ['many cards in one column', (n) => lines(n, (k) => `    c${k}`)],
  ['many columns', (n) => lines(n, (k) => `  col${k}\n    c${k}`)],
  ['cards at every depth', (n) => lines(n, (k) => `${' '.repeat((k % 40) + 3)}c${k}`)],
  ['repeated ids', (n) => lines(n, () => '    a[x]')],
  ['data on every card', (n) => lines(n, (k) => `    c${k}@{ ticket: T-${k}, priority: 'High' }`)],
  [
    'multi-line data on every card',
    (n) => lines(n, (k) => `    c${k}@{\n      ticket: T-${k}\n    }`),
  ],
  ['bad YAML on every card', (n) => lines(n, (k) => `    c${k}@{ x: [ }`)],
  ['decorations on every card', (n) => lines(n, (k) => `    c${k}\n    :::a b\n    ::icon(x)`)],
  ['misplaced indents', (n) => lines(n, (k) => ` m${k}`)],
  ['syntax errors on every line', (n) => lines(n, (k) => `    a[b] c${k}`)],
  // Symbols (#463): assignee reads, and class words found in a line cut by removed spans.
  ['an assignee on every card', (n) => lines(n, (k) => `    c${k}@{ assigned: p${k % 50} }`)],
  ['many class words', (n) => `${KB}    a\n    :::${'w '.repeat(n / 2)}`],
  [
    'class words cut by directives',
    (n) => `${KB}    a\n    :::${'w%%{init: {}}%%x '.repeat(n / 18)}`,
  ],
  [
    'class words after an entity',
    (n) => `${KB}    a\n    :::#35; ${'w '.repeat(n / 2)}%%{init: {}}%%`,
  ],
];

describe('stress: the kanban parser is linear in input size', () => {
  it.each(PARSE_SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseKanban(small); // warm up
      parseKanban(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseKanban(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseKanban(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );

  it('parses a board of 10k cards', () => {
    const src =
      KB + Array.from({ length: 10_000 }, (_, k) => `${' '.repeat((k % 8) + 4)}c${k}`).join('\n');
    // 10,001 items: one over core's default `maxNodes` (#459), which this test is not about.
    const r = parseKanban(src, { maxNodes: 20_000 });
    expect(r.diagnostics).toEqual([]);
    expect(r.model.items).toHaveLength(10_001);
    expect(r.model.columns[0]?.cards).toHaveLength(10_000);
  });
});
