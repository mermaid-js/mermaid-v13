import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { expectedOf } from './expected.ts';
import { layoutCells, renderAscii, type AsciiOptions } from './render.ts';
import { readStructure, type Charset } from './structure.ts';

// The ASCII goldens (D83, R-ASCII-2). For each mermaid-ascii fixture Mermaid accepts:
// - a structural check of our drawing against `upstream.txt`: every node label inside a box,
//   every edge label present, every edge line connected box to box, as many arrowheads. A
//   fixture that fails is listed in `ascii-divergences.json` as `structural`; an unlisted
//   failure and a listed fixture that passes (a stale entry) both fail.
// - our reviewed `expected.txt`, compared exactly, in the fixture's charset, and
//   `expected.<other>.txt` in the other charset unless the other group has the same input.
// The `v13/` cases (our own: shapes, directions, subgraphs, scripts, titles, width) have
// `expected.txt` (Unicode) and `expected.ascii.txt`.
// Goldens are written with `vitest run -u <this file>` and reviewed by hand (tickets/48.md).

const ROOT = fileURLToPath(new URL('../../ascii/', import.meta.url));
const UPSTREAM = ['ascii', 'extended-chars', 'multibyte'] as const;

interface Fixture {
  id: string;
  dir: string;
  input: string;
  charset: Charset;
  options: AsciiOptions;
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
        maxWidth?: number;
      };
      // `paddingX`/`paddingY` have no config home: `ascii.padding` is `compact | roomy`
      // (DESIGN §6.3), so these fixtures render with the default (tickets/48.md).
      const options: AsciiOptions = { charset: meta.charset };
      if (meta.maxWidth !== undefined) options.maxWidth = meta.maxWidth;
      return {
        id: `${group}/${name}`,
        dir,
        input: readFileSync(join(dir, 'input.mmd'), 'utf8'),
        charset: meta.charset,
        options,
      };
    });

const divergences = JSON.parse(
  readFileSync(join(ROOT, 'ascii-divergences.json'), 'utf8')
) as Divergence[];
const rejected = new Set(
  divergences.filter((d) => d.kind === 'rejected-input').map((d) => d.fixture)
);
const upstream = UPSTREAM.flatMap(fixturesOf).filter((f) => !rejected.has(f.id));
const v13 = fixturesOf('v13');
const other = (c: Charset): Charset => (c === 'unicode' ? 'ascii' : 'unicode');

/** A fixture in the other upstream group with the same input and options (`extended-chars/x` for `ascii/x`). */
function namesake(f: Fixture): Fixture | undefined {
  const name = f.id.split('/')[1];
  const twin = upstream.find((g) => g.id.split('/')[1] === name && g.charset !== f.charset);
  const same = (a: AsciiOptions, b: AsciiOptions) =>
    JSON.stringify({ ...a, charset: 0 }) === JSON.stringify({ ...b, charset: 0 });
  return twin && twin.input === f.input && same(twin.options, f.options) ? twin : undefined;
}

/** What the structural check finds wrong, ours against upstream; empty when it passes. */
async function structuralProblems(f: Fixture): Promise<string[]> {
  const layout = await layoutCells(f.input, f.options);
  const expected = expectedOf(layout, layout.title);
  const ours = readStructure((await renderAscii(f.input, f.options)).text, f.charset, expected);
  const theirs = readStructure(
    readFileSync(join(f.dir, 'upstream.txt'), 'utf8'),
    f.charset,
    expected
  );
  const problems: string[] = [];
  for (const [who, s] of [
    ['ours', ours],
    ['upstream', theirs],
  ] as const) {
    if (s.missingNodes.length)
      problems.push(`${who}: node labels in no box: ${s.missingNodes.join(',')}`);
    if (s.missingEdgeLabels.length)
      problems.push(`${who}: edge labels missing: ${s.missingEdgeLabels.join(',')}`);
    if (s.dangling.length)
      problems.push(`${who}: edge lines with a free end at ${s.dangling.join(',')}`);
  }
  if (ours.heads !== theirs.heads)
    problems.push(`arrowheads: ours ${ours.heads}, upstream ${theirs.heads}`);
  return problems;
}

describe('ascii goldens: structural check against upstream.txt (D83)', () => {
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

describe('ascii goldens: expected.txt (exact)', () => {
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
    const { text } = await renderAscii(c.f.input, { ...c.f.options, charset: c.charset });
    await expect(text).toMatchFileSnapshot(join(c.f.dir, c.file));
  });

  it('has no expected file for a rejected input', () => {
    for (const id of rejected) {
      const dir = join(ROOT, id);
      expect(
        readdirSync(dir).filter((n) => n.startsWith('expected')),
        id
      ).toEqual([]);
    }
  });

  it('has a v13 case for each area the spec names', () => {
    expect(v13.length).toBeGreaterThanOrEqual(10);
    for (const f of v13) expect(existsSync(join(f.dir, 'input.mmd')), f.id).toBe(true);
  });
});
