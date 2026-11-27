/**
 * The lexer's, parser's and model's small paths against the implementations they replaced, kept
 * as the reference: the INITIAL rules tried in order without the first-character table, a
 * token's range always mapped through the offset maps, a token's text always cooked, edges
 * indexed by id as they are made, and class styles always split through the `§§§` swap. Each
 * generated text is parsed both ways and the whole result (tokens, model, AST, diagnostics,
 * symbols, statements) must be equal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowBuilderBase, FlowLexer, FlowParser } from '@mermaid-js/shared/parser/flow';
import { StateLexer } from '@mermaid-js/shared/parser/state';
import { referencePaths } from '@mermaid-js/shared/testing/parser-reference';
import { parseFlowchart } from '../index.ts';
import { flowchartLanguage } from '../language.ts';
import { FlowBuilder } from './model.ts';

const HEADERS = [
  'flowchart LR\n',
  'graph TD;',
  'flowchart-elk TB\n',
  'graph\n',
  'flowchart RL\r\n',
];

// prettier-ignore
const FRAGMENTS = [
  // ids, keywords as prefixes of ids, direction words in ids
  'A', 'B1', 'node_x', 'end', 'endX', 'end ', 'style1', 'classA', 'class', 'classDefX',
  'clicked', 'callback', 'call', 'href', 'hrefX', 'href ', 'graphic', 'graph', 'subgraphs',
  'defaultX', 'default', 'interpolateX', 'linkStyleX', 'direction', 'directionTB', 'xdirection LR',
  'LRx', 'TBnode', 'v', 'vx', 'v1', 'o', 'x', 'oA', 'xB', 'o--', 'x--', '_self', '_selfX', '_top',
  'accTitleX', 'accX', 'a', 'c', 'h', '_', '1', '12ab', '007', 'mermaid', 'mermaid {',
  // Unicode, entities
  'é', 'ñode', '日本', 'Ω', '😀', ' ', ' ', '　', '#35;', '#quot;', '#9829;', '#',
  // punctuation and shape openers
  ':', ':::', '::', '&', ';', ',', '*', '^', '<', '>', '-', '=', '~', '.', '\\', '|', '\\|', '@',
  '[x]', '(x)', '((x))', '(((x)))', '([x])', '[[x]]', '[(x)]', '[/x/]', '[\\x\\]', '[/x\\]',
  '{x}', '{{x}}', '>x]', '(-x-)', '[|a:b|]', '["q"]', '("`md`")', '[x', '(x', '{x',
  '@{ shape: rect }', '@{ label: "q" }', '@{', '}', ']', ')',
  // links of every kind and length
  '-->', '---', '--x', '--o', '<-->', 'x--x', 'o--o', '----->', '-.->', '-..->', '.-', '-.-',
  '-.', '.->', '==>', '===', '<==>', '=====>', '==', '~~~', '~~~~', '~~', '-- text -->',
  '-. text .->', '== text ==>', '-->|t|', '--|t|', '--- ', ' --> ', '\t-->\t', ' ~~~ ', '--',
  // edge ids, generated-looking ids
  'e1@-->', 'e1@', 'L_A_B_0@-->', 'L_A_B_0', 'L_A_B_2', 'L_x', 'a@b@-->', '"q"@-->',
  // statements
  'style A fill:#f9f,stroke:#333;', 'style A color:red', 'classDef c fill:#f00,color:red',
  'classDef d a\\,b,c;', 'classDef e x§§§y,z', 'classDef f', 'class A c', 'class e1 c',
  'class L_A_B_0 c', 'click A "http://x"', 'click A call f()', 'click B href "u" _blank',
  'linkStyle 0 stroke:red', 'linkStyle default interpolate basis', 'subgraph S [t]',
  'subgraph T', 'direction LR', 'direction', 'accTitle: t', 'accDescr: d', 'accDescr { m }',
  'e1@{ animate: true }', 'L_A_B_0@{ curve: basis }',
  // separators, comments, directives
  ' ', '  ', '\t', '\n', '\n', '\n', '\r\n', '\r', ';', '\n%% comment\n', '%% c', '%%{init: {}}%%\n',
  '"q"', '"`md`"', '"',
];

const ENDINGS = ['', '\n', '\r', '\r\n', ' ', '\n\n', ';'];

/** A seeded generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function texts(count: number, seed: number): string[] {
  const rnd = random(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const out = ['', 'flowchart LR', 'flowchart LR\n', 'graph TD\r', 'graph TD\r\n', 'flowchart'];
  for (let i = 0; i < count; i++) {
    let s = rnd() < 0.95 ? pick(HEADERS) : '';
    const n = 1 + Math.floor(rnd() * 30);
    for (let k = 0; k < n; k++) {
      s += pick(FRAGMENTS);
      const r = rnd();
      if (r < 0.3) s += ' ';
      else if (r < 0.55) s += '\n';
    }
    out.push(s + pick(ENDINGS));
  }
  return out;
}

const parse = (src: string) => parseFlowchart(src, { keepTokens: true });

describe('lexer and model small paths', () => {
  it('replace the right methods', () => {
    const lexer = FlowLexer.prototype as unknown as Record<string, unknown>;
    const state = StateLexer.prototype as unknown as Record<string, unknown>;
    const builder = FlowBuilderBase.prototype as unknown as Record<string, unknown>;
    const parser = Object.getPrototypeOf(FlowParser.prototype) as Record<string, unknown>;
    const now = () => [
      lexer.initial,
      state.emit,
      parser.raw,
      builder.edgeNamed,
      builder.hasEdge,
      builder.addClass,
    ];
    const before = now();
    const during = referencePaths(now);
    during.forEach((fn, k) => expect(fn).not.toBe(before[k]));
    expect(now()).toEqual(before);
  });

  it('give the reference result on generated texts', () => {
    for (const src of texts(4000, 1)) {
      const fast = parse(src);
      const reference = referencePaths(() => parse(src));
      expect(fast, JSON.stringify(src)).toEqual(reference);
    }
  });

  it('give the reference result where edge ids and vertex ids meet', () => {
    const cases = [
      'flowchart LR\nA-->B\nL_A_B_0',
      'flowchart LR\nA-->B\nL_A_B_0@-->C\nclass L_A_B_0 c',
      'flowchart LR\nA e1@-->B\nclass e1 c\ne1\ne1@{ animate: true }',
      'flowchart LR\nA e1@-->B\nC e1@-->D\nclass e1 c',
      'flowchart LR\ne1\nA e1@-->B',
      'flowchart LR\nA-->B\nA-->B\nL_A_B_2@-->C\nL_A_B_2',
      'flowchart LR\nA & B --> C & D\nclass L_B_C_0 c\nL_A_D_0@{ curve: basis }',
      'flowchart LR\nA x@-->B\nL_A_B_0@-->C\nclass x,L_A_B_0 k\nclick x call f()',
      'flowchart LR\nsubgraph L_A_B_0\nA-->B\nend\nclass L_A_B_0 k',
      'flowchart LR\nclassDef a fill:#f00\\,x,color:red;stroke:blue\nclassDef b q§§§r,s\\,t',
    ];
    for (const src of cases) expect(parse(src), src).toEqual(referencePaths(() => parse(src)));
  });

  it('split class styles as the reference does, `§§§` and `\\,` included', () => {
    // `§` never reaches `addClass` from a source (no style token takes it); the builder is
    // called directly.
    const lists = [
      ['fill:#f00', 'color:red'],
      ['fill:red\\,blue', 'color:z;stroke:q'],
      ['a§§§b,c', 'd'],
      ['a§§b', 'c§'],
      ['', ''],
      [],
      ['x;y;;z,', ',\\,§§§'],
    ];
    const build = () => {
      const b = new FlowBuilder({
        maxEdges: 10,
        maxNodes: 10,
        inheritDir: false,
        error: () => undefined,
        warn: () => undefined,
      });
      lists.forEach((styles, k) => b.addClass(`c${k},d`, [...styles]));
      return b.classes;
    };
    expect(build()).toEqual(referencePaths(build));
  });
});

/** Fastest of three timings of `run`, in ms (Date.now: no DOM or Node types here). */
const fastest = (run: () => unknown): number => {
  let best = Infinity;
  for (let t = 0; t < 3; t++) {
    const t0 = Date.now();
    run();
    best = Math.min(best, Date.now() - t0);
  }
  return best;
};

// R-PARSE-7: edges are indexed by id as lookups need them, each once. Each shape is parsed at
// n and 4n edges; linear predicts ~4x, quadratic (re-indexing per lookup) ~16x; the bar is 8x.
describe('edges indexed on lookup stay linear', () => {
  const lines = (n: number, line: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => line(i)).join('\n');
  it.each([
    [
      'ids, then a class on each',
      (n: number) =>
        lines(n, (i) => `n${i} e${i}@--> n${i + 1}`) + '\n' + lines(n, (i) => `class e${i} k`),
    ],
    [
      'ids and lookups interleaved',
      (n: number) => lines(n, (i) => `n${i} e${i}@--> n${i + 1}\nclass e${i} k\nm${i}`),
    ],
    [
      'generated ids written as vertices',
      (n: number) => lines(n, (i) => `n${i} --> n${i + 1}\nL_n${i}_n${i + 1}_0`),
    ],
  ])('%s', (_name, text) => {
    const options = { maxEdges: 1e6, maxNodes: 1e6 };
    const small = 'flowchart LR\n' + text(2_000);
    const large = 'flowchart LR\n' + text(8_000);
    let ratio = Infinity;
    for (let attempt = 0; attempt < 3 && ratio >= 8; attempt++) {
      const s = fastest(() => parseFlowchart(small, options));
      ratio = Math.min(ratio, fastest(() => parseFlowchart(large, options)) / Math.max(s, 1));
    }
    expect(ratio).toBeLessThan(8);
  });
});

// A token's text is sliced straight from the source while it lies in a stretch with no CR, `#`
// or `}` (the characters `cook` may read otherwise), the character before it included; anything
// else, a token read again behind that stretch included, is cooked as before.
describe('token text without cooking', () => {
  const sources = [
    // CRLF and lone CR line ends, inside labels and strings too
    'flowchart LR\r\nA --> B\r\nB -- text --> C\r\n',
    'graph TD\rA[x\ry] --> B\r\nC["a\r\nb"]\r',
    'flowchart LR\nA["one\r\ntwo"] -->|"three\rfour"| B\r\n%% c\r\nC',
    // entities, decoded or not, in labels, edge text, ids and styles
    'flowchart LR\nA["#35; #quot;x#quot; #9829; #nope;"] -->|#35;| B[#lt;b#gt;]',
    'flowchart LR\nA#35;B --> C\nstyle A fill:#f9f,stroke:#333;\nclassDef c color:#fff',
    'flowchart LR\nA -- #35; text --> B\nA == #amp; ==> C\nA -.#quot;.-> D',
    // a token straight after `}`, or after `}` and blanks before a line end
    'flowchart LR\nA{x}B\nC{x}-->D\nE{{x}}F',
    'flowchart LR\nA{x}   \n  B\nC@{ shape: rect }D\nE@{ label: "q" }\t\nF',
    'flowchart LR\nsubgraph S\nA\nend}\nB}C\n}D\naccDescr { a\n}\nX',
    'flowchart LR\nA["}x}"] --> B{"}"}\nclick A "u"}x\n}',
    // `}`, blanks and a line end inside a token, which `cook` closes up to `}` and the line end
    'flowchart LR\nA["a}   \nb"] --> B\nA -- x}  \ny --> C{"q}\t\nr"}',
    // errors: messages read tokens behind the one at fault; recovery lexes again mid-document
    'flowchart LR\nA --> B C D -->\nE[unclosed\nF --> G\nH["also\nI}',
    'flowchart LR\nA -->|t B\nC((x) --> D\nstyle\nclass A\n#\nE --> F',
    'graph TD\r\nA[x --> B\r\nC{y --> D\r\nE#35;( --> F\r\n}G',
    // removed spans and a mask: always cooked
    'flowchart LR\n%%{init: {}}%%\nA --> B %% c\nC["<b class="x">y</b>"]\nD{x}E',
  ];

  it('gives the reference result, at every probe offset too', () => {
    const run = (src: string, probe?: number) =>
      flowchartLanguage.parse(src, { keepTokens: true, ...(probe === undefined ? {} : { probe }) });
    for (const src of sources) {
      expect(run(src), JSON.stringify(src)).toEqual(referencePaths(() => run(src)));
      for (let at = 0; at <= src.length; at++) {
        const fast = run(src, at);
        expect(fast, `${JSON.stringify(src)} at ${at}`).toEqual(referencePaths(() => run(src, at)));
      }
    }
  });

  // Each search for the next CR, `#` or `}` starts at or past where the last one stopped, so
  // no stretch of the source is searched twice: the characters searched add up to at most the
  // source and one for each search. Each of the three absent, once at the very end, and at every
  // other character, in sources of a million characters (a `}` on every line is an error each
  // time, which costs far more than the rest, so that source is 40,000 characters).
  describe('searches each part of the source once', () => {
    const test = RegExp.prototype.test;
    let searched = 0;
    let searches = 0;
    afterEach(() => vi.restoreAllMocks());
    const count = () => {
      searched = 0;
      searches = 0;
      vi.spyOn(RegExp.prototype, 'test').mockImplementation(function (this: RegExp, s: string) {
        if (this.source !== '[\\r#}]' || !this.global) return test.call(this, s);
        const from = this.lastIndex;
        const found = test.call(this, s);
        searched += (found ? this.lastIndex : s.length) - from;
        searches++;
        return found;
      });
    };
    const N = 1_000_000;
    const body = (n: number) => 'flowchart LR\n' + 'a1 --> b2\n'.repeat(n / 10);
    it.each([
      ['none of them', body(N)],
      ['a CR at the end', body(N) + '\r'],
      ['a `#` at the end', body(N) + '#'],
      ['a `}` at the end', body(N) + '}'],
      ['a CR every other character', 'flowchart LR\n' + 'a\r'.repeat(N / 2)],
      ['a `#` every other character', 'flowchart LR\n' + '#;'.repeat(N / 2)],
      ['a `}` every other character', 'flowchart LR\n' + '}\n'.repeat(20_000)],
      ['a `}` before every edge', 'flowchart LR\n' + 'a{b}-->c\n'.repeat(25_000)],
      ['a `}` every other character in a label', 'flowchart LR\nA["' + '}a'.repeat(N / 2) + '"]'],
    ])('%s', (_name, src) => {
      count();
      parseFlowchart(src, { maxEdges: Infinity, maxNodes: Infinity });
      expect(searches).toBeGreaterThan(0);
      expect(searched).toBeLessThanOrEqual(src.length + searches);
    });
  });
});
