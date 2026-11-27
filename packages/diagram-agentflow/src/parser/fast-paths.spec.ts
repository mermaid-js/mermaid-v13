/**
 * Agentflow on the flow family's small paths (first-character INITIAL dispatch, the token
 * range fast path, token text sliced without cooking, edges indexed on lookup, class styles
 * without the `§§§` swap) against the reference implementations: each generated text parses to
 * the same result both ways.
 */
import { describe, expect, it } from 'vitest';
import { referencePaths } from '@mermaid-js/shared/testing/parser-reference';
import { agentflowLanguage } from '../language.ts';
import { parseAgentflow } from './parser.ts';

// prettier-ignore
const FRAGMENTS = [
  'A', 'b_1', 'end', 'endX', 'flow', 'flowX', 'connector', 'connectorX', 'global', 'globalX',
  'style', 'styleX', 'default', 'linkStyle', 'interpolate', 'class', 'classDef', 'click', 'call',
  'href', 'direction', 'directionLR', 'x', 'o', 'v', 'é', '日本', '#35;', '1', 'L_A_B_0',
  '["t"]', '(t)', '{t}', '[[t]]', '>t]', '(-t-)', '@{ shape: tool }', '@{ model: "m" }',
  '-->', '--x', '---', '-.-', '-.->', '-- t -->', '----->', '~~~', '==>', '<--', '.',
  'e1@-->', 'L_A_B_0@-->', 'class e1 k', 'classDef k fill:#f00,color:red',
  'classDef j a\\,b;c', 'style A fill:#f9f;', 'linkStyle 0 stroke:red',
  'flow F["F"]', 'connector C["C"]', 'direction TB', 'accTitle: t', 'accDescr: d',
  ' ', '\t', '\n', '\n', '\r\n', '\r', ';', '%% c', '\n%% c\n', '  %% c\n', '%%{init: {}}%%\n',
  '"q"', '%', ':', '&', ',',
];

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
  const out = ['', 'agentflow-beta', 'agentflow-beta\r', 'agentflow-beta TB\r\n'];
  for (let i = 0; i < count; i++) {
    let s = rnd() < 0.95 ? 'agentflow-beta TB\n' : '';
    const n = 1 + Math.floor(rnd() * 30);
    for (let k = 0; k < n; k++) {
      s += pick(FRAGMENTS);
      const r = rnd();
      if (r < 0.3) s += ' ';
      else if (r < 0.55) s += '\n';
    }
    out.push(s + pick(['', '\n', '\r', '\r\n', ' ']));
  }
  return out;
}

const parse = (src: string) => parseAgentflow(src, { keepTokens: true });

describe('agentflow on the small paths', () => {
  it('gives the reference result on generated texts', () => {
    for (const src of texts(2500, 7)) {
      expect(parse(src), JSON.stringify(src)).toEqual(referencePaths(() => parse(src)));
    }
  });
});

describe('agentflow token text without cooking', () => {
  // CRLF and CR, entities, a token straight after `}`, errors whose messages read tokens behind
  // the one at fault, and lexing again after an unclosed label; at every probe offset too.
  const sources = [
    'agentflow-beta TB\r\nA --> B\r\nB -- t --> C\r\n',
    'agentflow-beta TB\rA["x\r\ny"] --> B\r',
    'agentflow-beta TB\nA["#35; #quot;q#quot; #nope;"] -->|#35;| B\nstyle A fill:#f9f;',
    'agentflow-beta TB\nA{t}B\nC{t}-->D\nE@{ shape: tool }F\nflow F\n}x\nend',
    'agentflow-beta TB\nA --> B C -->\nD["unclosed\nE --> F\n}G\r\nH(x --> I',
    'agentflow-beta TB\n%% c\nA --> B\n\nC{x}D',
  ];

  it('gives the reference result', () => {
    const run = (src: string, probe?: number) =>
      agentflowLanguage.parse(src, { keepTokens: true, ...(probe === undefined ? {} : { probe }) });
    for (const src of sources) {
      expect(parse(src), JSON.stringify(src)).toEqual(referencePaths(() => parse(src)));
      for (let at = 0; at <= src.length; at++)
        expect(run(src, at), `${JSON.stringify(src)} at ${at}`).toEqual(
          referencePaths(() => run(src, at))
        );
    }
  });
});
