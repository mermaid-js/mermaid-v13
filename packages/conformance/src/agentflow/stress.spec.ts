import { describe, expect, it } from 'vitest';
import { agentflowTokens } from '@mermaid-js/diagram-agentflow';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the agentflow lexer is linear in input size, in every state and over
 * each of v12's rewrites (kept comments, removed directives, dropped `;`, the blanks after a
 * `}`, entities, tag quotes). Long single lines exercise the `.*direction` rules, which jison
 * retries from every position to the line end (quadratic in v12), and long `@{…}` blocks the
 * shape-data states. Shape copied from `../sankey/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic ~64x, and the bar is 24x, timed with `linearRatio`
 * (`../linear-time.ts`).
 */
const H = 'agentflow-beta TB\n';
/** `unit` repeated to about `n` characters. */
const times = (unit: string, n: number): string =>
  unit.repeat(Math.max(1, Math.round(n / unit.length)));

const SHAPES: [string, (n: number) => string][] = [
  // `.*direction`: one long line, the word late, never, or many times without a match.
  ['a long line, then direction', (n) => H + times('a --> b ', n) + 'direction TB'],
  ['a long line holding no direction', (n) => H + times('a --> b ', n)],
  ['direction words on one line', (n) => H + times('directionx ', n)],
  ['direction words without a value', (n) => H + times('a direction ', n)],
  ['a long comment line with direction', (n) => H + '%% ' + times('x ', n) + 'direction LR'],
  ['many direction lines', (n) => H + times('direction LR\n', n)],
  // Shape data.
  ['a long @{} block', (n) => H + 'a@{ ' + times('k: v, ', n) + '}'],
  ['a long multi-line @{} block', (n) => H + 'a@{\n' + times('  k: v\n', n) + '}'],
  ['a long quoted @{} value', (n) => H + 'a@{ label: "' + times('x\n  ', n) + '" }'],
  ['an unclosed @{} block', (n) => H + 'a@{ ' + times('k: v\n', n)],
  ['an unclosed quoted @{} value', (n) => H + 'a@{ label: "' + times('x ', n)],
  ['many @{} blocks', (n) => H + times('a@{ shape: tool }\n', n)],
  ['back-to-back @{} blocks', (n) => H + 'a' + times('@{ x: 1 }', n)],
  ['@{} blocks with blanks after them', (n) => H + times('a@{ shape: tool }   \n\n', n)],
  // Blank runs and links.
  ['a long blank run', (n) => H + 'a' + ' '.repeat(n) + 'b'],
  ['a blank run before a dash', (n) => H + 'a' + ' '.repeat(n) + '-b'],
  ['a blank run before a dot link', (n) => H + 'a' + ' '.repeat(n) + '-.b'],
  ['a blank run before a link', (n) => H + 'a' + ' '.repeat(n) + '--> b'],
  ['a blank run before a comment', (n) => H + 'a' + ' \t'.repeat(n / 2) + '%% c'],
  ['a blank run of other blanks', (n) => H + 'a' + ' \u00a0'.repeat(n / 2) + '%% c'],
  ['a long dash run', (n) => H + 'a ' + '-'.repeat(n) + ' b'],
  ['blanks and dashes', (n) => H + 'a' + times(' -', n) + ' b'],
  ['a long dot run', (n) => H + 'a -' + '.'.repeat(n) + ' b'],
  ['many links', (n) => H + times('a --> b --x c -.- d\n', n)],
  ['long edge text', (n) => H + 'a -- ' + times('t ', n) + '--> b'],
  ['edge text of blank runs', (n) => H + 'a --' + times(' '.repeat(50) + 'x', n) + ' --> b'],
  ['edge text of single dashes', (n) => H + 'a -- ' + times('- ', n) + '--> b'],
  ['unclosed edge text', (n) => H + 'a -- ' + times('t -- ', n)],
  ['edge text of blanks before dashes', (n) => H + 'a --' + times('   --', n) + ' b'],
  // Comments.
  ['comment lines', (n) => H + times('a --> b\n%% c\n', n)],
  ['indented comment lines', (n) => H + times('  \t%% c\n', n)],
  ['a long comment', (n) => H + '%% ' + 'x'.repeat(n) + '\na'],
  ['comments after statements', (n) => H + times('a --> b %% c\n', n)],
  ['bare comment lines', (n) => H + times('%%\n', n)],
  ['comments in labels', (n) => H + times('a[x %% y\n z]\n', n)],
  ['comments in trapezoid labels', (n) => H + times('a[/x %% y\n z/]\n', n)],
  ['comments in ellipse labels', (n) => H + times('a(- x %% y\n -)\n', n)],
  // Labels.
  ['a long text label', (n) => H + 'a[' + 'x'.repeat(n) + ']'],
  ['an unclosed text label', (n) => H + 'a[' + times('x ', n)],
  ['percents in a label', (n) => H + 'a[' + times('5% ', n) + ']'],
  ['percents in a trapezoid label', (n) => H + 'a[/' + times('5% ', n) + '/]'],
  ['a long ellipse label', (n) => H + 'a(-' + 'x'.repeat(n) + '-)'],
  ['a long trapezoid label', (n) => H + 'a[/' + 'x'.repeat(n) + '/]'],
  ['a long string', (n) => H + 'a["' + 'x'.repeat(n) + '"]'],
  ['an unclosed string', (n) => H + 'a["' + times('x\n', n)],
  ['a long markdown string', (n) => H + 'a["`' + 'x'.repeat(n) + '`"]'],
  ['nested shapes', (n) => H + 'a' + '['.repeat(n)],
  // Ids, link ids and the rest.
  ['a long id', (n) => H + 'a'.repeat(n)],
  ['a long id with @', (n) => H + 'a'.repeat(n) + '@x'],
  ['many @ in one run', (n) => H + times('a@', n) + '{'],
  ['many link ids', (n) => H + times('a e@--> b\n', n)],
  ['many statements', (n) => H + times('a --> b\n', n)],
  ['many flows', (n) => H + times('flow f[T]\n  a --> b\nend\n', n)],
  ['many connectors', (n) => H + times('connector c[C]@{ x: 1 }\n', n)],
  ['many braces with blanks after them', (n) => H + times('a{b}  \n', n)],
  ['many braces with blanks', (n) => H + times('}  ', n)],
  ['blank lines', (n) => H + 'a' + '\n'.repeat(n) + 'b'],
  ['blank CRLF lines', (n) => H + 'a' + '\r\n'.repeat(n / 2) + 'b'],
  ['lone CRs', (n) => H + times('a\r', n)],
  ['leading blank lines and comments', (n) => times('\n%% c\n', n) + H + 'a'],
  ['directives through lines', (n) => H + times('a%%{init: {}}%%b\n', n)],
  ['style lines', (n) => H + times('style a fill:#f00;\n', n)],
  ['a long style line', (n) => H + 'style a ' + times(':#f;', n)],
  ['entities', (n) => H + 'a[' + times('#quot;', n) + ']'],
  ['tag attributes', (n) => H + times('a[<b c="x">y</b>]\n', n)],
  ['many errors', (n) => H + times('a=b ', n)],
  ['unicode ids', (n) => H + times('ä --> ö\n', n)],
  ['click lines', (n) => H + times('click a call f(x)\n', n)],
  ['line separators', (n) => H + times('a\u2028%% c\u2029', n)],
];

/** The CPU-time ratio of `run` on 8n units of `build` over n (`linearRatio`, pitfall 5). */
const ratio = (build: (n: number) => string, run: (src: string) => unknown): number => {
  const small = build(4_000);
  const large = build(32_000);
  return linearRatio(
    () => run(small),
    () => run(large)
  );
};

describe('stress: the agentflow lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => expect(ratio(build, (src) => agentflowTokens(src))).toBeLessThan(24),
    30_000
  );
});

/** Past `maxTextSize` v12 lexed the comment-free text: the same shapes through that view. */
const COMMENT_FREE = SHAPES.filter(([name]) => /comment|blank|brace|style|directive/.test(name));

describe('stress: the agentflow lexer is linear past maxTextSize', () => {
  it.each(COMMENT_FREE)(
    '%s',
    (_name, build) => expect(ratio(build, (src) => agentflowTokens(src, 0))).toBeLessThan(24),
    30_000
  );
});
