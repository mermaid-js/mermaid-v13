import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, repairRoutes, routeCollisions } from '@mermaid-js/core/ascii';
import type { LayoutModel } from '@mermaid-js/core/layout';
import { createMermaid, MermaidError } from 'mermaid';
import { usecaseCases, usecaseCorpus } from '../usecase/corpus.ts';
import type { CorpusItem } from '../types.ts';
import type { Charset } from './structure.ts';
import { readUsecase, rectOf, type Rect } from './usecase-structure.ts';
import { renderUsecaseAscii, type UsecaseAsciiResult } from './usecase-render.ts';

// ASCII render properties of usecase (#569, D320, D478, R-ASCII-9) over the usecase corpus (e2e
// fixtures, v12 spec strings, the cases file) and generated boundary diagrams (pitfall 20), in
// both charsets, through the public `format: 'ascii'` API: renders wherever SVG renders,
// deterministic, `rows` lines none wider than `columns` and one exactly that wide, no trailing
// spaces, no box glyph in ascii output; no overlapping boxes, no line through a node, an edge
// label or a title; read back against the cell layout (`usecase-structure.ts`): every frame whole
// with only its title on its border (no arrowhead or label on a frame), every actor a figure with
// its labels under it, every use case a box whose label rows read `( … )` or `[ … ]`, notes and
// tables boxes with their text, edge labels in place, include/extend/note lines dotted and the
// rest solid, every end's marker (`▷`, `|>` in ascii) where the line meets its node; one
// `ASCII_DROPPED` per feature kind.

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  out: Record<Charset, UsecaseAsciiResult>;
  again: Record<Charset, string>;
}

/** A seeded generator (mulberry32), so the fuzz corpus is the same on every run. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARROWS = ['-->', '<--', '--', '--o', '--x', 'o--', 'x--', '-->'] as const;

/**
 * Boundary diagrams (pitfall 20: about 3% broke frames before the fix): one to three
 * boundaries of use cases and actors, actors and use cases outside, associations of every
 * arrow (some labelled, some long), include and extend between use cases, generalizations
 * between actors and between use cases, notes, in every direction. No self-loops: core's
 * `layered` gives two labelled loops on one node one label cell (GAPS, #569).
 */
export function boundaryFuzz(count: number, seed = 569): CorpusItem[] {
  const rnd = random(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const items: CorpusItem[] = [];
  for (let n = 0; n < count; n++) {
    const lines = ['usecase-beta', `direction ${pick(['LR', 'TB', 'RL', 'BT'])}`];
    const actors: string[] = [];
    const cases: string[] = [];
    const boundaries = 1 + Math.floor(rnd() * 3);
    for (let b = 0; b < boundaries; b++) {
      lines.push(`systemBoundary B${b}["Boundary ${b}"]${rnd() < 0.3 ? '@{ type: package }' : ''}`);
      const members = 1 + Math.floor(rnd() * 4);
      for (let m = 0; m < members; m++) {
        if (rnd() < 0.2) {
          const id = `a${b}${m}`;
          actors.push(id);
          lines.push(`  actor ${id}`);
        } else {
          const id = `U${b}${m}`;
          cases.push(id);
          lines.push(`  ${id}${rnd() < 0.3 ? `[Case ${b}.${m}]` : `("Case ${b}.${m}")`}`);
        }
      }
      lines.push('end');
    }
    const outside = 1 + Math.floor(rnd() * 3);
    for (let o = 0; o < outside; o++) {
      actors.push(`P${o}`);
      lines.push(`actor P${o}("Person ${o}")`);
      if (rnd() < 0.5) {
        cases.push(`X${o}`);
        lines.push(`X${o}("Outside ${o}")`);
      }
    }
    const relations = 2 + Math.floor(rnd() * 6);
    for (let r = 0; r < relations; r++) {
      const kind = rnd();
      if (kind < 0.55) {
        const a = pick([...actors, ...cases]);
        const c = pick(cases);
        // Two labelled self-loops on one node share their label's cell in core's layered (GAPS).
        if (a === c) continue;
        const long = rnd() < 0.15 ? '--' : '';
        const arrow =
          rnd() < 0.3 ? `-- "uses ${r}" --${long}>` : pick(ARROWS).replace('--', `--${long}`);
        lines.push(`${a} ${arrow} ${c}`);
      } else if (kind < 0.8 && cases.length > 1) {
        const [a, c] = [pick(cases), pick(cases)];
        if (a !== c) lines.push(`${a} ..> : ${pick(['include', 'extend'])} ${c}`);
      } else if (actors.length > 1 && rnd() < 0.5) {
        const [a, c] = [pick(actors), pick(actors)];
        if (a !== c) lines.push(`${a} --|> ${c}`);
      } else if (cases.length > 1) {
        const [a, c] = [pick(cases), pick(cases)];
        if (a !== c) lines.push(`${a} --|> ${c}`);
      }
    }
    if (rnd() < 0.4) lines.push(`note for ${pick([...actors, ...cases])} "A note"`);
    items.push({ id: `fuzz ${n}`, source: lines.join('\n') });
  }
  return items;
}

const cases: Case[] = [];
const fuzzed: Case[] = [];
const failed: Record<string, string> = {};
let corpusSize = 0;
let rejected = 0;

async function collect(items: readonly CorpusItem[], into: Case[]): Promise<void> {
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for (const item of items) {
    try {
      await svg.render('u', item.source);
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      rejected++;
      continue; // SVG does not render it either
    }
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderUsecaseAscii(item.source, { charset });
        again[charset] = (await renderUsecaseAscii(item.source, { charset })).text;
      }
      into.push({ id: item.id, out, again });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}

beforeAll(async () => {
  const corpus = [...(await usecaseCorpus()), ...usecaseCases()];
  corpusSize = corpus.length;
  await collect(corpus, cases);
  await collect(boundaryFuzz(150), fuzzed);
}, 600_000);

const all = () => [...cases, ...fuzzed];

/** `{ id: problems }` for the cases where `check` finds something, in either charset. */
function problems(
  check: (c: Case, cs: Charset) => readonly unknown[],
  of: readonly Case[] = all()
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of of) {
    const found = CHARSETS.flatMap((cs) => check(c, cs).map((p) => `${cs}: ${String(p)}`));
    if (found.length > 0) out[c.id] = found.slice(0, 6);
  }
  return out;
}

function overlaps(model: LayoutModel): string[] {
  const rects: (Rect & { id: string; group: boolean })[] = [
    ...[...model.nodes].map(([id, n]) => ({ id, group: false, ...rectOf(n) })),
    ...[...model.groups].map(([id, g]) => ({ id, group: true, ...rectOf(g) })),
  ];
  const apart = (a: Rect, b: Rect) => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
  const within = (a: Rect, b: Rect & { group: boolean }) =>
    b.group && a.x0 > b.x0 && a.x1 < b.x1 && a.y0 > b.y0 && a.y1 < b.y1;
  const found: string[] = [];
  rects.forEach((a, i) => {
    for (const b of rects.slice(i + 1))
      if (!apart(a, b) && !within(a, b) && !within(b, a)) found.push(`${a.id} × ${b.id}`);
  });
  return found;
}

describe('usecase ascii corpus properties (#569, D478, R-ASCII-9)', { timeout: 120_000 }, () => {
  it('renders every usecase diagram that renders to SVG, the corpus and the fuzzed boundaries', () => {
    expect(corpusSize).toBeGreaterThan(380);
    expect(cases.length).toBeGreaterThan(200);
    expect(rejected).toBeGreaterThan(0);
    expect(fuzzed.length).toBeGreaterThan(120);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(problems((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(
      problems((c, cs) => {
        const { text, rows, columns } = c.out[cs];
        const lines = text === '' ? [] : text.split('\n');
        const widest = Math.max(0, ...lines.map(cellWidth));
        const found: string[] = [];
        if (lines.length !== rows) found.push(`${lines.length} lines, rows ${rows}`);
        if (widest !== columns) found.push(`widest ${widest}, columns ${columns}`);
        lines.forEach((l, i) => {
          if (/\s$/u.test(l)) found.push(`trailing space on line ${i + 1}`);
        });
        if (text.includes('\r')) found.push('\\r in text');
        return found;
      })
    ).toEqual({});
  });

  it('uses no Unicode line or marker glyph in ascii output', () => {
    const glyph = /[─-◿✕]/u;
    expect(
      problems((c, cs) => {
        if (cs !== 'ascii') return [];
        const u = c.out.ascii.layout.usecase;
        const texts = [
          ...[...u.nodes.values()].flatMap((v) =>
            v.kind === 'json'
              ? [v.title, ...v.rows.flatMap((r) => [r.key, r.value])]
              : [v.label, 'stereotype' in v ? v.stereotype : undefined]
          ),
          ...u.boundaries.map((b) => b.label),
          ...u.edges.map((e) => (e.kind === 'relation' ? e.label : undefined)),
          u.title,
        ].flatMap((l) => (l ? l.lines.map((runs) => runs.map((r) => r.text).join('')) : []));
        if (texts.some((t) => glyph.test(t))) return [];
        return glyph.test(c.out.ascii.text) ? ['Unicode glyph in ascii output'] : [];
      })
    ).toEqual({});
  });

  it('has no overlapping boxes (nodes apart; a node or boundary inside a boundary or apart)', () => {
    expect(problems((c, cs) => overlaps(c.out[cs].layout))).toEqual({});
  });

  it('routes no line through a node, an edge label or a boundary title', () => {
    expect(
      problems((c, cs) => {
        const { layout } = c.out[cs];
        const graph = layout.usecase.graph;
        return routeCollisions(graph, layout, repairRoutes(graph, layout).routes)
          .filter((l) => l.kind === 'box' || l.kind === 'label')
          .map((l) => `${l.edge} ${l.kind} ${l.with}`);
      })
    ).toEqual({});
  });

  it('draws what the layout says, where it says: shapes, labels, line strokes and end markers', () => {
    let ends = 0;
    const found = problems((c, cs) => {
      const r = readUsecase(c.out[cs].text, cs, c.out[cs].layout);
      ends += r.ends;
      return r.faults;
    });
    expect(found).toEqual({});
    expect(ends).toBeGreaterThan(1000);
  });

  it('keeps every frame whole, with nothing but its title on its border, in the fuzzed boundaries (pitfall 20)', () => {
    const frames = problems(
      (c, cs) =>
        readUsecase(c.out[cs].text, cs, c.out[cs].layout).faults.filter((f) =>
          f.startsWith('boundary:')
        ),
      fuzzed
    );
    expect(frames).toEqual({});
  });

  it('warns at most once per dropped feature kind', () => {
    expect(
      problems((c, cs) => {
        const kinds = c.out[cs].warnings.flatMap((w) =>
          w.code === 'ASCII_DROPPED' ? [(w as { feature?: string }).feature] : []
        );
        return kinds.filter((k, i) => kinds.indexOf(k) !== i).map((k) => `twice: ${k}`);
      })
    ).toEqual({});
  });
});
