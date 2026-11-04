import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseEr } from '@mermaid-js/diagram-er';
import { loadOracle } from '../oracle.ts';
import { renderErAscii } from './er-render.ts';
import { erExpectedOf, readErStructure } from './er-structure.ts';
import type { Charset } from './structure.ts';

// The mermaid-ascii ER goldens (#136, D83, D100, D109, R-ASCII-2), from
// cmd/testdata/{er,er-ascii} at 5a9df15. For each fixture Mermaid accepts:
// - a structural check of our drawing against `upstream.txt`: every entity's table (name and
//   attribute cells) inside a box, every relationship label present, every line connected
//   box to box, as many relationship ends (crow's-foot runs) saying the same cardinalities,
//   no arrowheads. A fixture that
//   fails is listed in `ascii-divergences.json` as `structural`; an unlisted failure and a
//   listed fixture that passes (a stale entry) both fail.
// - our reviewed `expected.txt`, compared exactly, in the fixture's charset, and
//   `expected.<other>.txt` in the other charset unless the other group has the same input.
// The `er-v13/` cases are our own, with `expected.txt` (Unicode) and `expected.ascii.txt`.
// Goldens are written with `vitest run -u <this file>` and reviewed by hand (tickets/136.md).

const ROOT = fileURLToPath(new URL('../../ascii/', import.meta.url));
const GROUPS = { er: 70, 'er-ascii': 13 } as const;
const CHARSET = { er: 'unicode', 'er-ascii': 'ascii' } as const;
const UPSTREAM = Object.keys(GROUPS) as (keyof typeof GROUPS)[];

interface Fixture {
  id: string;
  dir: string;
  input: string;
  charset: Charset;
}

interface Divergence {
  fixture: string;
  kind: string;
  reason: string;
}

const fixturesOf = (group: string): Fixture[] =>
  readdirSync(join(ROOT, group))
    .sort()
    .map((name) => {
      const dir = join(ROOT, group, name);
      const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as {
        charset: Charset;
      };
      return {
        id: `${group}/${name}`,
        dir,
        input: readFileSync(join(dir, 'input.mmd'), 'utf8'),
        charset: meta.charset,
      };
    });

const ours = (id: string) => UPSTREAM.some((g) => id.startsWith(`${g}/`));
const divergences = (
  JSON.parse(readFileSync(join(ROOT, 'ascii-divergences.json'), 'utf8')) as Divergence[]
).filter((d) => ours(d.fixture));
const rejected = new Set(
  divergences.filter((d) => d.kind === 'rejected-input').map((d) => d.fixture)
);
const all = UPSTREAM.flatMap(fixturesOf);
const upstream = all.filter((f) => !rejected.has(f.id));
const v13 = fixturesOf('er-v13');
const other = (c: Charset): Charset => (c === 'unicode' ? 'ascii' : 'unicode');

/** The fixture in the other upstream group with the same input (`er-ascii/x` for `er/x`). */
const namesake = (f: Fixture): Fixture | undefined =>
  upstream.find(
    (g) =>
      g.id.split('/')[1] === f.id.split('/')[1] && g.charset !== f.charset && g.input === f.input
  );

describe('er ascii goldens: the fixtures', () => {
  it('has the 83 upstream fixtures, each complete', () => {
    for (const [group, count] of Object.entries(GROUPS))
      expect(readdirSync(join(ROOT, group)), group).toHaveLength(count);
    for (const f of all) {
      expect(f.input.trim(), f.id).not.toBe('');
      expect(readFileSync(join(f.dir, 'upstream.txt'), 'utf8'), f.id).not.toContain('␠');
      const meta = JSON.parse(readFileSync(join(f.dir, 'meta.json'), 'utf8')) as object;
      const [group, name] = f.id.split('/') as [keyof typeof CHARSET, string];
      expect(meta, f.id).toEqual({
        source: `cmd/testdata/${group}/${name}.txt`,
        charset: CHARSET[group],
      });
    }
  });

  it('lists divergences only for existing fixtures, once each, with a known kind', () => {
    const seen = new Set<string>();
    for (const d of divergences) {
      expect(Object.keys(d).sort(), d.fixture).toEqual(['fixture', 'kind', 'reason']);
      expect(existsSync(join(ROOT, d.fixture, 'input.mmd')), d.fixture).toBe(true);
      expect(['rejected-input', 'reinterpreted', 'structural'], d.fixture).toContain(d.kind);
      expect(d.reason.trim(), d.fixture).not.toBe('');
      expect(seen.has(`${d.fixture}\0${d.kind}`), `duplicate ${d.fixture}`).toBe(false);
      seen.add(`${d.fixture}\0${d.kind}`);
    }
  });

  it('lists exactly the inputs mermaid@12 and v13 reject as rejected-input', async () => {
    const oracle = await loadOracle();
    const found: string[] = [];
    for (const f of all) {
      const v12 = (await oracle.parse(f.input)).accepted;
      const v13Accepts = !parseEr(f.input).diagnostics.some((d) => d.severity === 'error');
      expect(v13Accepts, `${f.id}: v13 and mermaid@12 disagree`).toBe(v12);
      if (!v12) found.push(f.id);
    }
    expect([...rejected].sort()).toEqual(found.sort());
  }, 120_000);
});

/** What the structural check finds wrong, ours against upstream; empty when it passes. */
async function structuralProblems(f: Fixture): Promise<string[]> {
  const { text, layout } = await renderErAscii(f.input, { charset: f.charset });
  const expected = erExpectedOf(layout);
  const mine = readErStructure(text, f.charset, expected);
  const theirs = readErStructure(
    readFileSync(join(f.dir, 'upstream.txt'), 'utf8'),
    f.charset,
    expected
  );
  const problems: string[] = [];
  for (const [who, s] of [
    ['ours', mine],
    ['upstream', theirs],
  ] as const) {
    if (s.missingEntities.length)
      problems.push(`${who}: entities in no box: ${s.missingEntities.join(',')}`);
    if (s.missingEdgeLabels.length)
      problems.push(`${who}: relationship labels missing: ${s.missingEdgeLabels.join(',')}`);
    if (s.dangling.length)
      problems.push(`${who}: lines with a free end at ${s.dangling.join(',')}`);
    if (s.heads !== 0) problems.push(`${who}: ${s.heads} arrowheads`);
  }
  if (mine.ends !== theirs.ends)
    problems.push(`relationship ends: ours ${mine.ends}, upstream ${theirs.ends}`);
  else if (mine.kinds.join() !== theirs.kinds.join())
    problems.push(`cardinalities: ours ${mine.kinds.join()}, upstream ${theirs.kinds.join()}`);
  return problems;
}

describe('er ascii goldens: structural check against upstream.txt (D83)', () => {
  const failing = new Map<string, string[]>();
  beforeAll(async () => {
    for (const f of upstream) {
      const problems = await structuralProblems(f);
      if (problems.length > 0) failing.set(f.id, problems);
    }
  }, 120_000);

  const listed = () => divergences.filter((d) => d.kind === 'structural').map((d) => d.fixture);

  it('lists every structural failure in ascii-divergences.json', () => {
    const unlisted = [...failing].filter(([id]) => !listed().includes(id));
    expect(Object.fromEntries(unlisted)).toEqual({});
  });

  it('has no stale structural entries (listed fixtures that pass)', () => {
    expect(listed().filter((id) => !failing.has(id))).toEqual([]);
  });
});

describe('er ascii goldens: expected.txt (exact)', () => {
  const cases = [
    ...upstream.flatMap((f) => [
      { f, charset: f.charset, file: 'expected.txt' },
      ...(namesake(f)
        ? []
        : [{ f, charset: other(f.charset), file: `expected.${other(f.charset)}.txt` }]),
    ]),
    ...v13.flatMap((f) => [
      { f, charset: f.charset, file: 'expected.txt' },
      { f, charset: other(f.charset), file: `expected.${other(f.charset)}.txt` },
    ]),
  ];

  it.each(cases.map((c) => [`${c.f.id}/${c.file}`, c] as const))('%s', async (_, c) => {
    const { text } = await renderErAscii(c.f.input, { charset: c.charset });
    await expect(text).toMatchFileSnapshot(join(c.f.dir, c.file));
  });

  it('has no expected file for a rejected input', () => {
    for (const id of rejected)
      expect(
        readdirSync(join(ROOT, id)).filter((n) => n.startsWith('expected')),
        id
      ).toEqual([]);
  });

  it('has our own cases', () => {
    expect(v13.length).toBeGreaterThanOrEqual(8);
    for (const f of v13) expect(existsSync(join(f.dir, 'input.mmd')), f.id).toBe(true);
  });
});
