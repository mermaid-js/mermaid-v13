import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFlowchartForParity } from './flowchart/v13.ts';
import { loadOracle } from './oracle.ts';

/**
 * The mermaid-ascii flowchart goldens (D83, R-ASCII-2): every folder is complete, every
 * divergence names a fixture, and the `rejected-input` entries are exactly the inputs that
 * mermaid@12 and v13 reject. Rendering against them is in `ascii/goldens.spec.ts` (#48).
 */
const ROOT = fileURLToPath(new URL('../ascii/', import.meta.url));
const GROUPS = { ascii: 92, 'extended-chars': 47, multibyte: 3 } as const;
const CHARSET = { ascii: 'ascii', 'extended-chars': 'unicode', multibyte: 'ascii' } as const;
const HEADER = /^(padding[xy]|maxwidth)\s*=\s*\d+\s*$/im;
const KINDS = ['rejected-input', 'reinterpreted', 'structural'];

interface AsciiDivergence {
  fixture: string;
  kind: string;
  reason: string;
}

// The flowchart's entries: the ER goldens (`er/`, `er-ascii/`) list theirs in the same file.
const readDivergences = () =>
  (
    JSON.parse(readFileSync(join(ROOT, 'ascii-divergences.json'), 'utf8')) as AsciiDivergence[]
  ).filter((d) => Object.keys(GROUPS).some((g) => d.fixture.startsWith(`${g}/`)));

const fixtures = Object.keys(GROUPS).flatMap((group) =>
  readdirSync(join(ROOT, group)).map((name) => `${group}/${name}`)
);

describe('ascii goldens', () => {
  it('has the 142 upstream fixtures', () => {
    for (const [group, count] of Object.entries(GROUPS)) {
      expect(readdirSync(join(ROOT, group)), group).toHaveLength(count);
    }
    expect(fixtures).toHaveLength(142);
  });

  it.each(fixtures)('%s is complete', (fixture) => {
    const dir = join(ROOT, fixture);
    const input = readFileSync(join(dir, 'input.mmd'), 'utf8');
    expect(input.trim()).not.toBe('');
    expect(input).not.toMatch(HEADER);
    expect(readFileSync(join(dir, 'upstream.txt'), 'utf8')).not.toContain('␠');

    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const group = fixture.split('/')[0] as keyof typeof CHARSET;
    const name = fixture.split('/')[1];
    expect(meta.source).toBe(`pkg/graph/testdata/${group}/${name}.txt`);
    expect(meta.charset).toBe(CHARSET[group]);
    for (const [key, value] of Object.entries(meta)) {
      if (key === 'source' || key === 'charset') continue;
      expect(['paddingX', 'paddingY', 'maxWidth'], key).toContain(key);
      expect(Number.isInteger(value), key).toBe(true);
    }
  });

  it('lists divergences only for existing fixtures, once each', () => {
    const entries = readDivergences();
    const seen = new Set<string>();
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(['fixture', 'kind', 'reason']);
      const { fixture, kind, reason } = entry;
      expect(existsSync(join(ROOT, fixture, 'input.mmd')), fixture).toBe(true);
      expect(KINDS, fixture).toContain(kind);
      expect(reason.trim(), fixture).not.toBe('');
      expect(seen.has(`${fixture}\0${kind}`), `duplicate ${fixture}`).toBe(false);
      seen.add(`${fixture}\0${kind}`);
    }
  });

  it('lists exactly the inputs mermaid@12 and v13 reject as rejected-input', async () => {
    const oracle = await loadOracle();
    const rejected: string[] = [];
    for (const fixture of fixtures) {
      const input = readFileSync(join(ROOT, fixture, 'input.mmd'), 'utf8');
      const v12 = (await oracle.parse(input)).accepted;
      let v13 = true;
      try {
        parseFlowchartForParity(input);
      } catch {
        v13 = false;
      }
      expect(v13, `${fixture}: v13 and mermaid@12 disagree`).toBe(v12);
      if (!v12) rejected.push(fixture);
    }
    const listed = readDivergences()
      .filter((d) => d.kind === 'rejected-input')
      .map((d) => d.fixture);
    expect(listed.sort()).toEqual(rejected.sort());
  }, 120_000);
});
