import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../corpus.ts';
import { JISON_NAMES, parseState, StateTokenKind } from '@mermaid-js/diagram-state';

/**
 * R-ERR-5: messages name constructs in Mermaid terms, never a token kind or grammar rule. We
 * break every e2e state fixture in seeded ways and check every message produced.
 */
const RULES = [
  // `statement` and `document` are jison rules too, but plain words in a message.
  'idStatement',
  'classDefStatement',
  'styleStatement',
  'cssClassStatement',
  'notePosition',
];
// Token names: jison terminals with an underscore or in capitals, and v13 kind names that are
// compounds (`StateDescr`, `StructStart`, …); plain words such as `note` are Mermaid syntax.
const TOKENS = [
  ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
  ...Object.keys(StateTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
].filter((n) => !['NL', 'AS', 'ID', 'SD'].includes(n));
const BANNED = new RegExp(`\\b(?:${[...RULES, ...TOKENS].join('|')})\\b`);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mmd') ? [p] : [];
  });
const FIXTURES = ['e2e/diagrams/state-diagram', 'e2e/diagrams/state-diagram-v2'].flatMap((d) =>
  walk(join(REPO_ROOT, d))
);

const BREAKS = [
  '-->',
  '->',
  '{',
  '}',
  '"',
  ':',
  ':::',
  '--',
  'state ',
  'note ',
  '[*]',
  '\n',
  ' as ',
];

describe('state error messages', () => {
  it('never contain token or rule names', () => {
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const messages = new Set<string>();
    for (const file of FIXTURES) {
      const src = readFileSync(file, 'utf8');
      for (let k = 0; k < 6; k++) {
        const at = Math.floor(rnd() * src.length);
        const piece = BREAKS[Math.floor(rnd() * BREAKS.length)] ?? '';
        const broken = src.slice(0, at) + piece + src.slice(at + (k % 2));
        for (const d of parseState(broken).diagnostics) messages.add(d.message);
      }
    }
    expect(messages.size).toBeGreaterThan(30);
    // Text in backticks is the author's own or Mermaid syntax.
    const prose = (m: string) => m.replace(/`[^`]*`/g, '');
    expect([...messages].filter((m) => BANNED.test(prose(m)))).toEqual([]);
  });

  it('detects a token name in a message', () => {
    expect(BANNED.test("Expecting 'STRUCT_STOP', got 'COMPOSIT_STATE'")).toBe(true);
    expect(BANNED.test('Expected `}`, got `A`.')).toBe(false);
  });
});
