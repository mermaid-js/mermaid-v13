import { describe, expect, it } from 'vitest';
import { detectSankey, parseSankey } from '@mermaid-js/diagram-sankey';
import { sankeyLanguage } from '@mermaid-js/diagram-sankey/language';
import { sankeyTokens } from '@mermaid-js/diagram-sankey/testing';
import { createLanguageService } from '@mermaid-js/language-service';
import { linearRatio } from '../linear-time.ts';

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

/** Per-run CPU ratio of `run` on n and 8n units of `build` (`linearRatio`). */
const ratio = (build: (n: number) => string, run: (src: string) => unknown): number => {
  const small = build(4_000);
  const large = build(32_000);
  return linearRatio(
    () => run(small),
    () => run(large)
  );
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
 * A chain of rows about `n` characters long, closed from its last node back to `n0`: one strongly
 * connected component as large as the text.
 */
const cycle = (n: number): string => {
  let out = S;
  let k = 0;
  for (; out.length < n; k++) out += `n${k},n${k + 1},1\n`;
  return `${out}n${k},n0,1`;
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
  ['a long cycle', (n) => cycle(n)],
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

/**
 * The facet through the language service (#504): reading every name (`nameSyntax.read`, which
 * looks at the line each name is on), semantic tokens, a rename of a name on every row and a
 * completion at the end are linear too, with the same ratio test.
 */
const service = createLanguageService({
  facets: [
    { type: 'sankey', id: 'sankey', detector: (t) => detectSankey(t), facet: sankeyLanguage },
  ],
});
let uri = 0;
const query = (src: string) => {
  const doc = service.update(`stress:///${uri++}`, src);
  doc.semanticTokens();
  doc.rename(src.indexOf('hub') + 1, 'renamed, "hub"');
  doc.completions(src.length);
  doc.hover(src.indexOf('hub') + 1);
};
const SERVICE_SHAPES: [string, (n: number) => string][] = [
  ['many rows', (n) => rows(n, (k) => `hub,t${k},1`)],
  ['short rows', (n) => rows(n, (k) => (k === 0 ? 'hub,a,1' : `a,b${k % 10},1`))],
  ['quoted names with CRLF', (n) => rows(n, (k) => `"hub","t ""${k}""",1\r`)],
  ['long lines of quoted fields', (n) => rows(n, (k) => `hub,"${'x,'.repeat(k % 50)}${k}",1`)],
  [
    'a style line, then rows',
    (n) => 'sankey\nstyle,b,1 :#f;\n' + rows(n, (k) => `hub,t${k},1`).slice(7),
  ],
];

describe('stress: the sankey facet through the service is linear in input size', () => {
  it.each(SERVICE_SHAPES)(
    '%s',
    (_name, build) => expect(ratio(build, query)).toBeLessThan(24),
    30_000
  );
});
