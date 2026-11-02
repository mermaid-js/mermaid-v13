import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../corpus.ts';
import { FlowTokenKind, JISON_NAMES, parseFlowchart } from '@mermaid-js/diagram-flowchart';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every e2e flowchart fixture in seeded ways and check every message produced.
 */
const RULES = [
  'vertexStatement',
  'styledVertex',
  'idString',
  'idStringToken',
  'textNoTags',
  'textNoTagsToken',
  'textToken',
  'linkStatement',
  'arrowText',
  'edgeText',
  'edgeTextToken',
  'alphaNum',
  'alphaNumToken',
  'graphConfig',
  'FirstStmtSeparator',
  'spaceList',
  'stylesOpt',
  'styleComponent',
  'numList',
  'shapeData',
  'clickStatement',
  'styleStatement',
  'linkStyleStatement',
  'classDefStatement',
  'classStatement',
];
// Token names: jison terminals with an underscore or two capitals, and v13 kind names that
// are compounds (`NodeString`, `StartLink`, …); plain words such as `end` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|[A-Z].*[A-Z]/.test(n)),
  ...Object.keys(FlowTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
];
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const FIXTURES = join(REPO_ROOT, 'e2e/diagrams/flowchart');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mmd') ? [p] : [];
  });

const BREAKS = [
  '[',
  '(',
  '{',
  '|',
  '"',
  '-->',
  '->',
  '=>',
  ';',
  'end',
  '@{',
  '#quot;',
  ':::',
  '\n',
  ' & ',
];

describe('flowchart error messages', () => {
  it('never contain token or rule names', () => {
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const messages = new Set<string>();
    for (const file of walk(FIXTURES)) {
      const src = readFileSync(file, 'utf8');
      for (let k = 0; k < 6; k++) {
        const at = Math.floor(rnd() * src.length);
        const piece = BREAKS[Math.floor(rnd() * BREAKS.length)] ?? '';
        const broken = src.slice(0, at) + piece + src.slice(at + (k % 2));
        for (const d of parseFlowchart(broken).diagnostics) messages.add(d.message);
      }
    }
    expect(messages.size).toBeGreaterThan(40);
    expect([...messages].filter((m) => BANNED.test(m))).toEqual([]);
  });

  it('detects a token name in a message', () => {
    expect(BANNED.test("Expecting 'SQE', got 'NODE_STRING'")).toBe(true);
    expect(BANNED.test('Expected label text or `]`, got `(`.')).toBe(false);
  });
});
