import { describe, expect, it } from 'vitest';
import { parseSankey } from '@mermaid-js/diagram-sankey';
import { sankeyTokens } from '@mermaid-js/diagram-sankey/testing';

/**
 * R-PARSE-7, pitfall 5: the sankey lexer (and below, the parser) is linear in input size, in
 * every state and over each of v12's rewrites (trimming, collapsed line breaks, removed spans,
 * entities, stalls). Shape copied from `../pie/stress.spec.ts`: n and 8n units; linear is ~8x,
 * quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of five, and small
 * and large runs alternate.
 */
const S = 'sankey\n';
const SHAPES: [string, (n: number) => string][] = [
  ['a long field', (n) => S + 'a'.repeat(n) + ',b,1'],
  ['a long field of blanks', (n) => S + 'a' + ' '.repeat(n) + 'b,c,1'],
  ['a long value', (n) => S + 'a,b,' + '1 '.repeat(n / 2)],
  ['many rows', (n) => S + 'a,b,1\n'.repeat(n / 6)],
  ['blank lines', (n) => S + 'a,b,1' + '\n'.repeat(n) + 'c,d,2'],
  ['blank CRLF lines', (n) => S + 'a,b,1' + '\r\n'.repeat(n / 2) + 'c,d,2'],
  ['lines of blanks', (n) => S + 'a,b,1' + '\n   '.repeat(n / 4)],
  ['leading blanks and line breaks', (n) => ' \n'.repeat(n / 2) + S + 'a,b,1'],
  ['trailing blanks and line breaks', (n) => S + 'a,b,1' + ' \n'.repeat(n / 2)],
  ['a long quoted field', (n) => S + '"' + 'a,'.repeat(n / 2) + '",b,1'],
  ['a quoted field of line breaks', (n) => S + '"a' + '\n'.repeat(n) + 'b",c,1'],
  ['doubled quotes', (n) => S + '"' + '""'.repeat(n / 2) + '",b,1'],
  ['an unterminated quote', (n) => S + '"' + 'a,b,1\n'.repeat(n / 6)],
  ['an unterminated quote of doubled quotes', (n) => S + '"' + '""'.repeat(n / 2)],
  ['many quoted fields', (n) => S + '"a","b",1\n'.repeat(n / 10)],
  ['stray quotes', (n) => S + 'a"'.repeat(n / 2)],
  ['a run of characters no rule reads', (n) => S + 'a' + 'é'.repeat(n) + ',b,1'],
  ['many characters no rule reads', (n) => S + 'a\t'.repeat(n / 2)],
  ['tabs in quotes', (n) => S + '"' + 'a\t'.repeat(n / 2) + '",b,1'],
  ['entities', (n) => S + '#a;'.repeat(n / 3) + ',b,1'],
  ['hashes', (n) => S + '#a'.repeat(n / 2) + ',b,1'],
  ['comment lines between rows', (n) => S + 'a,b,1\n%% c\n'.repeat(n / 11)],
  ['blanks then comment lines', (n) => S + 'a,b,1' + ' \n'.repeat(n / 4) + '%% c\n'],
  ['a quoted field split by comment lines', (n) => S + '"a\n%% c\n'.repeat(n / 8) + '",b,1'],
  ['directives through fields', (n) => S + 'a%%{init: {}}%%b,c,1\n'.repeat(n / 21)],
  ['CRLF rows split by comment lines', (n) => S + 'a,b,1\r\n%% c\r\n'.repeat(n / 13)],
  ['bare percent lines', (n) => S + 'a,b,1\n%%\n'.repeat(n / 9)],
  ['tag attributes', (n) => S + '<b c="x">,d,1\n'.repeat(n / 14)],
  // A dropped `;` and many removed spans: each token's range is read across the cut text.
  [
    'a style line, then CRLF rows split by comment lines',
    (n) => S + 'style a:#f;,b,1\r\n' + 'a,b,1\r\n%% c\r\n'.repeat(n / 13),
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

/** Best-of-five CPU ratio of `run` on n and 8n units of `build`. */
const ratio = (build: (n: number) => string, run: (src: string) => unknown): number => {
  const small = build(4_000);
  const large = build(32_000);
  run(small); // warm up
  run(large);
  let tSmall = Infinity;
  let tLarge = Infinity;
  for (let round = 0; round < 5; round++) {
    tSmall = Math.min(
      tSmall,
      cost(() => run(small))
    );
    tLarge = Math.min(
      tLarge,
      cost(() => run(large))
    );
  }
  return tLarge / Math.max(tSmall, 2);
};

describe('stress: the sankey lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => expect(ratio(build, sankeyTokens)).toBeLessThan(24),
    30_000
  );
});

/** Rows until the text is about `n` characters long. */
const rows = (n: number, row: (k: number) => string): string => {
  let out = S;
  for (let k = 0; out.length < n; k++) out += row(k) + '\n';
  return out.slice(0, -1);
};

/**
 * R-PARSE-7, pitfalls 11 and 19: the parser (nodes by name, AST ids, cycles, value warnings,
 * recovery) is linear in input size on the lexer's shapes and on its own, with the same n and
 * 8n ratio test.
 */
const PARSE_SHAPES: [string, (n: number) => string][] = [
  ...SHAPES,
  ['many distinct nodes', (n) => rows(n, (k) => `s${k},t${k},1`)],
  ['fan-out from one node', (n) => rows(n, (k) => `hub,t${k},1`)],
  ['fan-in to one node', (n) => rows(n, (k) => `s${k},hub,1`)],
  ['a long chain', (n) => rows(n, (k) => `n${k},n${k + 1},1`)],
  ['a long cycle', (n) => rows(n, (k) => `n${k},n${k + 1},1`) + '\nn1,n0,1'],
  ['a self-link on every row', (n) => rows(n, (k) => `n${k},n${k},1`)],
  ['repeated links', (n) => rows(n, () => 'a,b,1')],
  ['quoted names', (n) => rows(n, (k) => `"s ""${k}""","t,${k}",1`)],
  ['invalid values on every row', (n) => rows(n, (k) => `s${k},t${k},x${k}`)],
  ['trailing text on every value', (n) => rows(n, (k) => `s${k},t${k},1 ${k}`)],
  ['syntax errors on every row', (n) => rows(n, (k) => `s${k},t${k}`)],
  ['lines of blanks between rows', (n) => rows(n, (k) => `s${k},t${k},1\n   `)],
];

describe('stress: the sankey parser is linear in input size', () => {
  it.each(PARSE_SHAPES)(
    '%s',
    (_name, build) => expect(ratio(build, (src) => parseSankey(src))).toBeLessThan(24),
    30_000
  );

  it('parses 3,000 rows', () => {
    const lines = Array.from(
      { length: 3_000 },
      (_, k) => `Source ${k % 97},Target ${k},${(k % 50) + 0.5}`
    );
    const r = parseSankey(`sankey\n\n${lines.join('\n')}`);
    expect(r.diagnostics).toEqual([]);
    expect(r.model.links).toHaveLength(3_000);
    expect(r.model.nodes).toHaveLength(97 + 3_000);
    expect(r.ast.children).toHaveLength(3_000);
  });
});
