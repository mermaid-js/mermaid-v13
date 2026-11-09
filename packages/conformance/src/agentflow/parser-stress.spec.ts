import { describe, expect, it } from 'vitest';
import { parseAgentflow, semanticModel } from '@mermaid-js/diagram-agentflow';

/**
 * R-PARSE-7, pitfalls 5 and 11: the agentflow parser and model are linear in input size,
 * `semanticModel()` included, over what the lexer's stress spec (`stress.spec.ts`) leaves out:
 * fan-out, long chains, many and deeply nested flows (collapsed or not), containment chains,
 * `global` blocks after many flows, reopened flows, connectors that replace nodes, metadata
 * dropped before its flow, styling and errors. Pie's ratio pattern: n and 8n units, best of
 * five CPU times; linear is ~8x, quadratic ~64x, and the bar is 24x.
 */
const H = 'agentflow-beta TB\n';
/** `unit(i)` for i = 0, 1, … to about `n` characters. */
const many = (unit: (i: number) => string, n: number): string => {
  let out = '';
  for (let i = 0; out.length < n; i++) out += unit(i);
  return out;
};

const SHAPES: [string, (n: number) => string][] = [
  ['a fan-out', (n) => H + many((i) => `a${i} & `, n) + 'z --> b'],
  ['a fan-in', (n) => H + 'a --> ' + many((i) => `b${i} & `, n) + 'z'],
  ['a long chain', (n) => H + many((i) => `n${i} --> `, n) + 'end1'],
  ['many vertices', (n) => H + many((i) => `n${i}[Label ${i}]@{ shape: tool }\n`, n)],
  ['many flows', (n) => H + many((i) => `flow f${i}[F]\n  a${i} --> b${i}\nend\n`, n)],
  [
    'deeply nested flows',
    (n) => {
      const opens = many((i) => `flow f${i}\n`, n / 2);
      const k = opens.split('\n').length - 1;
      return H + opens + 'a\n' + 'end\n'.repeat(k);
    },
  ],
  [
    'deeply nested collapsed flows',
    (n) => {
      const opens = many((i) => `flow f${i}@{ view: collapsed }\n`, n / 2);
      const k = opens.split('\n').length - 1;
      return H + opens + 'a\n' + 'end\n'.repeat(k);
    },
  ],
  ['a containment chain', (n) => H + many((i) => `flow f${i}\n  x${i} --> f${i + 1}\nend\n`, n)],
  [
    'a containment cycle',
    (n) => {
      const body = many((i) => `flow f${i}\n  x${i} --> f${i + 1}\nend\n`, n);
      return H + body + 'flow f_last\n  y --> f0\nend\n';
    },
  ],
  [
    'global blocks after many flows',
    (n) =>
      H +
      many((i) => `flow f${i}\n  a${i}\nend\n`, n / 2) +
      many((i) => `global\n  a${i}\nend\n`, n / 2),
  ],
  ['a reopened flow', (n) => H + many((i) => `flow f\n  a${i}\nend\n`, n)],
  [
    'connectors that replace nodes',
    (n) => H + many((i) => `c${i} --> d\n`, n / 2) + many((i) => `connector c${i}[C]\n`, n / 2),
  ],
  [
    'metadata before its flow',
    (n) => H + many((i) => `f${i}@{ view: collapsed }\nflow f${i}\n  a\nend\n`, n),
  ],
  ['view on nodes', (n) => H + many((i) => `a${i}@{ view: collapsed }\n`, n)],
  ['removed shapes', (n) => H + many((i) => `a${i}((x))\n`, n)],
  [
    'styling',
    (n) =>
      H +
      many(
        (i) =>
          `classDef c${i} fill:#f96\na${i}:::c${i} --> b\nclass b c${i}\nstyle a${i} fill:red\n`,
        n
      ),
  ],
  [
    'a long linkStyle list',
    (n) =>
      H +
      many((i) => `a${i} --> b\n`, n / 2) +
      'linkStyle ' +
      many((i) => `${i},`, n / 2) +
      '0 stroke:red',
  ],
  [
    'edge ids and their metadata',
    (n) => H + many((i) => `a e${i}@--> b\ne${i}@{ animate: true }\n`, n),
  ],
  [
    'multi-line metadata with trailing commas',
    (n) => H + 'a@{\n  shape: "tool",\n' + many((i) => `  k${i}: v,\n`, n) + '}',
  ],
  ['many errors', (n) => H + many(() => 'a ==> b\n', n)],
  ['many unclosed labels', (n) => H + many((i) => `a${i}[x\n`, n)],
  ['many stray ends', (n) => H + many(() => 'end\n', n)],
  ['many comments between statements', (n) => H + many((i) => `a${i} --> b %% c\n%% d\n`, n)],
];

/**
 * The ranges of tokens whose keyword has no token (`click`, `accDescr {`) map through the
 * view's runs, one per directive. A fresh offset table per token was quadratic in them, which
 * shows from about 40,000 characters (8x at 4,000 and 32,000; 32x at 40,000 and 320,000), so
 * these run at ten times the size.
 */
const RUN_SHAPES: [string, (n: number) => string][] = [
  [
    'click lines between directives',
    (n) => H + many((i) => `click a${i} call f(x)\n%%{init: {}}%%\n`, n),
  ],
  [
    'click links between directives',
    (n) => H + many((i) => `a${i} --> b\nclick a${i} "https://x" _blank\n%%{init: {}}%%\n`, n),
  ],
  [
    'multi-line accDescr between directives',
    (n) => H + many(() => 'accDescr {\n  x\n}\n%%{init: {}}%%\n', n),
  ],
];

/** Shapes with comments, past `maxTextSize`, where v12 parsed the text without them. */
const COMMENT_FREE = SHAPES.filter(([name]) => name.includes('comment'));

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
const ratio = (build: (n: number) => string, run: (src: string) => unknown, n = 4_000): number => {
  const small = build(n);
  const large = build(8 * n);
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

const parse = (src: string) =>
  semanticModel(parseAgentflow(src, { maxEdges: 1e9, maxNodes: 1e9, maxDepth: 1e9 }).model);

describe('stress: the agentflow parser is linear in input size', () => {
  it.each(SHAPES)('%s', (_name, build) => expect(ratio(build, parse)).toBeLessThan(24), 60_000);
});

const parsePast = (src: string) =>
  semanticModel(
    parseAgentflow(src, { maxEdges: 1e9, maxNodes: 1e9, maxDepth: 1e9, maxTextSize: 0 }).model
  );

describe('stress: the agentflow parser is linear past maxTextSize', () => {
  it.each(COMMENT_FREE)(
    '%s',
    (_name, build) => expect(ratio(build, parsePast)).toBeLessThan(24),
    60_000
  );
});

describe('stress: token ranges are linear in the directives', () => {
  it.each(RUN_SHAPES)(
    '%s',
    (_name, build) => expect(ratio(build, parse, 40_000)).toBeLessThan(24),
    120_000
  );
  it.each(RUN_SHAPES)(
    '%s, past maxTextSize',
    (_name, build) => expect(ratio(build, parsePast, 40_000)).toBeLessThan(24),
    120_000
  );
});
