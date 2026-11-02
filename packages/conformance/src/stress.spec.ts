import { describe, expect, it } from 'vitest';
import { asLimitError, LimitError } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { assertInert } from '@mermaid-js/core/svg';
import { flowchartTokens, parseFlowchart } from '@mermaid-js/diagram-flowchart';
import { renderForTest } from '@mermaid-js/diagram-flowchart/testing';

/**
 * Stress suite (R-PARSE-7, R-SEC-5, DESIGN §10), run in PR CI as part of `pnpm test`.
 * Inputs built for worst cases (regex backtracking, quadratic scans, deep recursion,
 * multiplying edges, oversized output), after Pele's `tests/stress.test.ts`. Each one must
 * finish inside the bound and either succeed or fail cleanly: a parse with error
 * diagnostics, or a `LimitError`. Anything else thrown is a crash. The bounds are loose: a
 * regression here is seconds or a hang, not milliseconds.
 */

const N = 50_000;
const BOUND_MS = 3_000;
/** Every limit lifted, so the stage itself is stressed rather than the limit check. */
const NO_LIMITS = {
  limits: {
    maxSourceLength: Infinity,
    maxEdges: Infinity,
    maxNodes: Infinity,
    maxDepth: Infinity,
    maxOutputLength: Infinity,
  },
};
const repeat = (count: number, line: (i: number) => string): string =>
  Array.from({ length: count }, (_, i) => line(i)).join('');
const parse = (src: string) =>
  parseFlowchart(src, { maxEdges: Infinity, maxNodes: Infinity, maxDepth: Infinity });
const render = (src: string, options: Parameters<typeof renderForTest>[1] = NO_LIMITS) =>
  renderForTest(src, options);

const CASES: [string, () => unknown][] = [
  // Preprocess: front matter, comments, directives.
  [
    'a quoted front matter value of blanks',
    () => preprocess('---\ntitle: "' + ' '.repeat(N - 100) + 'x"\n---\ngraph TD\nA'),
  ],
  [
    'a quoted front matter value of blank lines',
    () =>
      preprocess('---\ntitle: "' + (' '.repeat(98) + '\n').repeat(450) + 'x"\n---\ngraph TD\nA'),
  ],
  [
    'front matter fence over blank lines',
    () => preprocess('---\n' + ' \n'.repeat(16000) + 'graph TD\nA'),
  ],
  ['unclosed front matter', () => render('---\ntitle: x\n' + 'a: b\n'.repeat(8000))],
  ['unterminated comment markers', () => render('graph TD\nA\n%%' + 'x%%'.repeat(16000))],
  ['unclosed init directive', () => render('%%{init: ' + '{"a":'.repeat(8000) + '\ngraph TD\nA')],
  [
    'many unclosed directives',
    () => render('graph TD\n' + '%%{init: {"a": 1}\n'.repeat(3000) + 'A'),
  ],
  [
    'an init directive nested 10,000 deep',
    () => render('%%{init: ' + '['.repeat(10000) + ']'.repeat(10000) + '}%%\ngraph TD\nA'),
  ],
  // Lexer.
  [
    'long line that mentions direction',
    () => flowchartTokens('graph TD;' + 'A-->B;'.repeat(N / 6) + 'direction XX'),
  ],
  [
    'long unspaced chain ending in metadata',
    () => flowchartTokens('graph TD;A' + '-->D'.repeat(N / 4) + '@{shape: rect}\n'),
  ],
  ['edge text of spaces', () => flowchartTokens('graph TD;A -- ' + ' '.repeat(N) + 'x --> B')],
  [
    'edge text of link-like characters',
    () => flowchartTokens('graph TD;A -- ' + 'xo< -'.repeat(N / 5) + ' --> B'),
  ],
  [
    'ellipse text of spaces and tildes',
    () => flowchartTokens('graph TD;A(-' + ' ~'.repeat(N / 2) + '-)'),
  ],
  [
    'runs of dashes, dots, equals',
    () => flowchartTokens('graph TD;A' + '-'.repeat(N) + '.'.repeat(N) + '='.repeat(N)),
  ],
  [
    'tag-like text with no closing bracket',
    () => render('graph TD\nA["' + '<a'.repeat(N / 2) + '"]'),
  ],
  // Unclosed constructs.
  ['an unclosed label', () => render('graph TD\nA[' + 'x '.repeat(N / 2 - 20))],
  ['an unclosed string', () => render('graph TD\nA["' + 'x '.repeat(N / 2 - 20))],
  ['unclosed labels on every line', () => render('graph TD\n' + 'A[x\n'.repeat(N / 5 - 10))],
  [
    'unclosed metadata over many lines',
    () => parse('graph TD\nA@{\n a: {\n' + ' b: 1,\n'.repeat(5000) + '}\n'),
  ],
  ['deeply bracketed metadata', () => parse('graph TD\nA@{ a: ' + '['.repeat(20000) + ' }\n')],
  ['metadata key followed by spaces', () => parse('graph TD\nA@{\n a' + ' '.repeat(N) + '\n}\n')],
  ['10,000 unclosed subgraphs', () => parse('graph TD\n' + 'subgraph s\n'.repeat(10000))],
  ['10,000 stray ends', () => parse('graph TD\n' + 'end\n'.repeat(10000))],
  // Nesting.
  [
    '20,000 nested subgraphs, parsed',
    () => parse('graph TD\n' + 'subgraph s\n'.repeat(20000) + 'A\n' + 'end\n'.repeat(20000)),
  ],
  [
    '1,000 nested subgraphs, rendered',
    () =>
      render(
        'graph TD\n' + repeat(1000, (i) => `subgraph s${i}\n`) + 'A-->B\n' + 'end\n'.repeat(1000)
      ),
  ],
  [
    'edges that each cross 1,000 nested subgraph borders',
    () =>
      render(
        'flowchart TD\n' +
          repeat(1000, (i) => `subgraph g${i}\n`) +
          'inner\n' +
          'end\n'.repeat(1000) +
          repeat(2000, (i) => `out${i % 50} --> inner\n`)
      ),
  ],
  [
    '5,000 sibling subgraphs',
    () => render('graph TD\n' + repeat(5000, (i) => `subgraph s${i}\nn${i}\nend\n`)),
  ],
  // Size.
  ['chain of 5,000', () => render('graph TD\n' + repeat(5000, (i) => `n${i}-->n${i + 1}\n`))],
  ['star of 5,000', () => render('graph TD\n' + repeat(5000, (i) => `c-->n${i}\n`))],
  [
    'complete graph of 60',
    () => {
      let s = 'graph TD\n';
      for (let i = 0; i < 60; i++) for (let j = i + 1; j < 60; j++) s += `n${i}-->n${j}\n`;
      return render(s);
    },
  ],
  [
    '2,000 parallel edges and 2,000 self loops',
    () => render('graph TD\n' + 'A-->B\n'.repeat(2000) + 'A-->A\n'.repeat(2000)),
  ],
  [
    '1,000 edges of length ten',
    () => render('graph TD\n' + repeat(1000, (i) => `n${i} ------------> n${i + 1}\n`)),
  ],
  // Labels.
  ['one 50,000 character label', () => render('graph TD\nA["' + 'word '.repeat(N / 5) + '"]')],
  [
    'a markdown label of 10,000 bold markers',
    () => render('graph TD\n  A["`' + '**a** '.repeat(5000) + '`"]\n  style A font-weight:bold\n'),
  ],
  ['label of emphasis markers', () => render('graph TD\nA["`' + '*a _b '.repeat(N / 6) + '`"]')],
  [
    'label of entities and line breaks',
    () => render('graph TD\nA["' + '#35;&amp;<br>'.repeat(N / 13) + '"]'),
  ],
  [
    'link wrapped in layers of entity encoding',
    () => render('graph TD\nA\nclick A "&' + '#38;'.repeat(N / 4) + 'x"'),
  ],
  [
    'style with colors and no semicolon',
    () => render('graph TD\nA\nstyle A ' + 'fill:#'.repeat(N / 8)),
  ],
  [
    'classDef made of colons and hashes',
    () => render('graph TD\nA\nclassDef c ' + ':#'.repeat(N / 4)),
  ],
  // Default limits: refused quickly, never attempted.
  ['source over the default limit', () => render('graph TD\n' + 'A-->B\n'.repeat(10000), {})],
  [
    'four million edges asked for by one line',
    () => {
      const ids = (p: string) => Array.from({ length: 2000 }, (_, i) => p + i).join(' & ');
      return render(`flowchart LR\n${ids('a')} --> ${ids('b')}\n`, {});
    },
  ],
  [
    '1,000 nested subgraphs at the default depth',
    () => render('graph TD\n' + 'subgraph s\n'.repeat(1000) + 'A\n' + 'end\n'.repeat(1000), {}),
  ],
];

/** Runs one case; returns the clean failure kind, or throws for a crash. */
async function attempt(run: () => unknown): Promise<string> {
  try {
    const out = await run();
    if (out && typeof out === 'object' && 'svg' in out) {
      assertInert((out as { svg: string }).svg);
      return 'rendered';
    }
    if (out && typeof out === 'object' && 'diagnostics' in out) {
      const errors = (out as { diagnostics: { severity: string }[] }).diagnostics;
      return errors.some((d) => d.severity === 'error') ? 'rejected' : 'parsed';
    }
    return 'ok';
  } catch (error) {
    const limit = asLimitError(error);
    if (limit) return `limit ${limit.limit}`;
    if (error instanceof Error && error.message.startsWith('parse failed')) return 'rejected';
    throw error;
  }
}

describe('stress: worst-case inputs finish in bounded time without crashing', () => {
  it.each(CASES)(
    '%s',
    async (_name, run) => {
      const started = performance.now();
      await attempt(run);
      expect(performance.now() - started).toBeLessThan(BOUND_MS);
    },
    30_000
  );
});

describe('stress: default limits refuse oversized input', () => {
  it('reports each as a LimitError', async () => {
    const outcome = async (name: string) => attempt(CASES.find(([n]) => n === name)![1]);
    expect(await outcome('source over the default limit')).toBe('limit maxSourceLength');
    expect(await outcome('four million edges asked for by one line')).toBe('limit maxEdges');
    expect(await outcome('1,000 nested subgraphs at the default depth')).toBe('limit maxDepth');
  });

  it('a stack overflow in any stage surfaces as a depth limit, not a crash', async () => {
    const deep = 'graph TD\n' + 'subgraph s\n'.repeat(20000) + 'A-->B\n' + 'end\n'.repeat(20000);
    const result = await attempt(() => render(deep));
    expect(['rendered', 'limit maxDepth']).toContain(result);
  }, 30_000);

  it('LimitError is what renderForTest throws for a limit', async () => {
    await expect(render('graph TD\nA-->B\nB-->C\n', { limits: { maxEdges: 1 } })).rejects.toThrow(
      LimitError
    );
  });
});

/** R-PARSE-7: parse time is linear. n and 4n: linear ~4x, quadratic ~16x; the bar is 8x. */
describe('stress: parse is linear in input size', () => {
  const SHAPES: [string, (n: number) => string][] = [
    ['a chain', (n) => 'graph TD\n' + repeat(n, (i) => `n${i}-->n${i + 1}\n`)],
    [
      'nested subgraphs',
      (n) => 'graph TD\n' + 'subgraph s\n'.repeat(n) + 'A\n' + 'end\n'.repeat(n),
    ],
    ['sibling subgraphs', (n) => 'graph TD\n' + repeat(n, (i) => `subgraph s${i}\nn${i}\nend\n`)],
    ['unclosed subgraphs', (n) => 'graph TD\n' + 'subgraph s\n'.repeat(n)],
    ['unclosed labels', (n) => 'graph TD\n' + 'A[x\n'.repeat(n)],
    ['linkStyle lines', (n) => 'graph TD\nA-->B\n' + 'linkStyle 0 stroke:red\n'.repeat(n)],
    ['class assignments', (n) => 'graph TD\n' + repeat(n, (i) => `n${i}:::c${i % 7}\n`)],
  ];
  const fastest = (run: () => unknown): number => {
    let best = Infinity;
    for (let t = 0; t < 3; t++) {
      const t0 = performance.now();
      run();
      best = Math.min(best, performance.now() - t0);
    }
    return best;
  };
  it.each(SHAPES)('%s', (_name, build) => {
    const small = build(2_000);
    const large = build(8_000);
    parse(small); // warm up
    const tSmall = fastest(() => parse(small));
    const tLarge = fastest(() => parse(large));
    expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(8);
  });
});
