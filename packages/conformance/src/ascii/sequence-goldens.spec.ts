import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderSequenceAscii } from './sequence-render.ts';
import { readSequence, sequenceExpectedOf } from './sequence-structure.ts';
import type { Charset } from './structure.ts';

// The mermaid-ascii sequence goldens (D83, D100, #150), as the flowchart ones (goldens.spec.ts):
// - a structural check of our drawing against `upstream.txt`: every participant label inside a
//   box, every message, note, fragment and box label present, as many arrowheads. A fixture
//   that fails is listed in `ascii/sequence/ascii-divergences.json` as `structural`; an unlisted
//   failure and a listed fixture that passes (a stale entry) both fail.
// - our reviewed `expected.txt`, compared exactly, in the fixture's charset, and
//   `expected.<other>.txt` in the other charset unless the other group has the same input.
// Goldens are written with `vitest run -u <this file>` and reviewed by hand.

const ROOT = fileURLToPath(new URL('../../ascii/sequence/', import.meta.url));
const GROUPS = { 'sequence-ascii': 'ascii', sequence: 'unicode' } as const;

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

const fixtures: Fixture[] = Object.entries(GROUPS).flatMap(([group, charset]) =>
  readdirSync(join(ROOT, group))
    .sort()
    .map((name) => {
      const dir = join(ROOT, group, name);
      return {
        id: `${group}/${name}`,
        dir,
        input: readFileSync(join(dir, 'input.mmd'), 'utf8'),
        charset,
      };
    })
);

const divergences = JSON.parse(
  readFileSync(join(ROOT, 'ascii-divergences.json'), 'utf8')
) as Divergence[];
const rejected = new Set(
  divergences.filter((d) => d.kind === 'rejected-input').map((d) => d.fixture)
);
const accepted = fixtures.filter((f) => !rejected.has(f.id));
const other = (c: Charset): Charset => (c === 'unicode' ? 'ascii' : 'unicode');

/** The fixture in the other group with the same name and input, if any. */
const namesake = (f: Fixture): Fixture | undefined =>
  accepted.find(
    (g) =>
      g.id.split('/')[1] === f.id.split('/')[1] && g.charset !== f.charset && g.input === f.input
  );

/** What the structural check finds wrong, ours against upstream; empty when it passes. */
async function structuralProblems(f: Fixture): Promise<string[]> {
  const { text, layout } = await renderSequenceAscii(f.input, { charset: f.charset });
  const expected = sequenceExpectedOf(layout);
  const ours = readSequence(text, f.charset, expected);
  const theirs = readSequence(
    readFileSync(join(f.dir, 'upstream.txt'), 'utf8'),
    f.charset,
    expected
  );
  const problems: string[] = [];
  for (const [who, s] of [
    ['ours', ours],
    ['upstream', theirs],
  ] as const) {
    if (s.missingParticipants.length)
      problems.push(`${who}: participant labels in no box: ${s.missingParticipants.join(',')}`);
    if (s.missingTexts.length) problems.push(`${who}: texts missing: ${s.missingTexts.join(',')}`);
  }
  if (ours.heads !== theirs.heads)
    problems.push(`arrowheads: ours ${ours.heads}, upstream ${theirs.heads}`);
  return problems;
}

describe('sequence ascii goldens: structural check against upstream.txt (D83)', () => {
  const failing = new Map<string, string[]>();
  beforeAll(async () => {
    for (const f of accepted) {
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

describe('sequence ascii goldens: expected.txt (exact)', () => {
  const cases = accepted.flatMap((f) => [
    { f, charset: f.charset, file: 'expected.txt' },
    ...(namesake(f)
      ? []
      : [{ f, charset: other(f.charset), file: `expected.${other(f.charset)}.txt` }]),
  ]);

  it.each(cases.map((c) => [`${c.f.id}/${c.file}`, c] as const))('%s', async (_, c) => {
    const { text } = await renderSequenceAscii(c.f.input, { charset: c.charset });
    await expect(text).toMatchFileSnapshot(join(c.f.dir, c.file));
  });

  it('has no expected file for a rejected input', () => {
    for (const id of rejected)
      expect(
        readdirSync(join(ROOT, id)).filter((n) => n.startsWith('expected')),
        id
      ).toEqual([]);
  });
});
