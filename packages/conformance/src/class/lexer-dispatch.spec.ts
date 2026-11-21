import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONDITIONS, RULES, rulesAt, type Scan } from '@mermaid-js/diagram-class/testing';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { FLOWCHART_FRAGMENTS, mutator, random } from '../fuzz/mutator.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The lexer tries, at each offset, only the rules that can start with the character there
 * (`rulesAt`). It must pick the rule jison's order picks: at every offset of every source, in
 * every start condition, the first rule of the short list that matches is the first rule of the
 * whole list that matches.
 */
const STATES = CONDITIONS.length;
const MUTANTS = 300;

const json = (path: string): CorpusItem[] =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as CorpusItem[];

async function sources(): Promise<string[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/class-diagram'), 'e2e'))
    items.push(item);
  items.push(...json('packages/conformance/corpus/class-v12-specs.json'));
  items.push(...json('packages/conformance/corpus/class-cases.json'));
  return items.map((i) => i.source);
}

/** The first rule of `list` that matches `text` at `p`, with the match's end. */
function first(list: readonly number[], scan: Scan, p: number): [number, number] | undefined {
  for (const k of list) {
    const end = RULES[k]?.match(scan, p) ?? -1;
    if (end >= 0) return [k, end];
  }
  return undefined;
}

/** Offsets where the short list picks another rule than the whole list, as `state:offset`. */
function disagreements(text: string): string[] {
  const out: string[] = [];
  for (let state = 0; state < STATES; state++) {
    const scan: Scan = { text, dirFailed: new Int32Array(4).fill(-1), dirNext: -2, lineEndAt: -1 };
    for (let p = 0; p <= text.length; p++) {
      const all = first(CONDITIONS[state] ?? [], scan, p);
      const some = first(rulesAt(state, text.charCodeAt(p)), scan, p);
      if (all?.[0] !== some?.[0] || all?.[1] !== some?.[1]) out.push(`state ${state} at ${p}`);
    }
  }
  return out;
}

describe('the class lexer picks its rule by the first character', () => {
  it('chooses what the whole rule list chooses, over every corpus source', async () => {
    const all = await sources();
    expect(all.length).toBeGreaterThan(400);
    const bad = all.flatMap((t, i) => disagreements(t).map((d) => `source ${i}: ${d}`));
    expect(bad).toEqual([]);
  }, 120_000);

  it(`and over ${MUTANTS} seeded mutants`, async () => {
    const next = mutator(await sources(), FLOWCHART_FRAGMENTS, random(20261115));
    const bad: string[] = [];
    for (let i = 0; i < MUTANTS; i++)
      for (const d of disagreements(next())) bad.push(`#${i}: ${d}`);
    expect(bad).toEqual([]);
  }, 120_000);

  it('leaves the rules in order, and prunes the lists it can', () => {
    for (let state = 0; state < STATES; state++) {
      const whole = CONDITIONS[state] ?? [];
      for (const c of [0x61, 0x7b, 0x20, 0x3a, 0xe9]) {
        const some = rulesAt(state, c);
        expect(some.every((k, i) => i === 0 || (some[i - 1] ?? 0) < k)).toBe(true);
        expect(some.every((k) => whole.includes(k))).toBe(true);
      }
      expect(rulesAt(state, Number.NaN)).toBe(whole);
    }
    // A letter in the initial state skips the literal and punctuation rules.
    expect(rulesAt(0, 0x7a).length).toBeLessThan((CONDITIONS[0] ?? []).length / 2);
  });
});
