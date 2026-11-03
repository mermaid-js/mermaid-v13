import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellWidth, repairRoutes, routeCollisions } from '@mermaid-js/core/ascii';
import type { LayoutModel } from '@mermaid-js/core/layout';
import { createMermaid, MermaidError } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';
import { expectedOf } from './expected.ts';
import { layoutCells, renderAscii, type AsciiResult } from './render.ts';
import { readStructure, type Charset } from './structure.ts';

// ASCII render properties over the whole in-repo flowchart corpus, in both charsets (D87,
// R-ASCII-9): renders wherever SVG renders, deterministic, every visible node label inside a
// box and every edge label present, no overlapping boxes, no edge through a box or an edge
// label, `rows` lines none wider than `columns` and one exactly that wide, no trailing spaces.
// Group titles are left out of the edge check: a few stay crowded (GAPS.md, #45).

const CHARSETS: Charset[] = ['unicode', 'ascii'];

interface Case {
  id: string;
  layout: Awaited<ReturnType<typeof layoutCells>>;
  out: Record<Charset, AsciiResult>;
  again: Record<Charset, string>;
}

const cases: Case[] = [];
const failed: Record<string, string> = {};

async function* corpus(): AsyncGenerator<CorpusItem> {
  yield* corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'e2e');
  const specs = join(REPO_ROOT, 'packages/conformance/corpus/flowchart-v12-specs.json');
  yield* JSON.parse(readFileSync(specs, 'utf8')) as CorpusItem[];
}

beforeAll(async () => {
  const svg = createMermaid();
  svg.initialize({ deterministic: true });
  for await (const item of corpus()) {
    let type: string;
    try {
      type = (await svg.render('corpus', item.source)).diagramType;
    } catch (e) {
      if (!(e instanceof MermaidError)) throw e;
      continue; // SVG does not render it either
    }
    if (!type.startsWith('flowchart')) continue;
    try {
      const out = {} as Case['out'];
      const again = {} as Case['again'];
      for (const charset of CHARSETS) {
        out[charset] = await renderAscii(item.source, { charset });
        again[charset] = (await renderAscii(item.source, { charset })).text;
      }
      cases.push({ id: item.id, layout: await layoutCells(item.source), out, again });
    } catch (e) {
      failed[item.id] = String(e);
    }
  }
}, 300_000);

/** `{ id: problems }` for the cases where `check` finds something. */
function problems(check: (c: Case) => unknown[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const c of cases) {
    const found = check(c);
    if (found.length > 0) out[c.id] = found;
  }
  return out;
}

const perCharset = (check: (c: Case, charset: Charset) => unknown[]) =>
  problems((c) => CHARSETS.flatMap((charset) => check(c, charset).map((p) => `${charset}: ${p}`)));

describe('ascii corpus properties (D87, R-ASCII-9)', () => {
  it('renders every flowchart that renders to SVG', () => {
    expect(cases.length).toBeGreaterThan(700);
    expect(failed).toEqual({});
  });

  it('is deterministic', () => {
    expect(perCharset((c, cs) => (c.out[cs].text === c.again[cs] ? [] : ['differs']))).toEqual({});
  });

  it('draws every visible node label inside a box, and every edge label', () => {
    expect(
      perCharset((c, cs) => {
        const s = readStructure(c.out[cs].text, cs, expectedOf(c.layout, c.layout.title));
        return [
          ...s.missingNodes.map((l) => `node label in no box: ${JSON.stringify(l)}`),
          ...s.missingEdgeLabels.map((l) => `edge label missing: ${JSON.stringify(l)}`),
        ];
      })
    ).toEqual({});
  });

  it('has `rows` lines, none wider than `columns` and one exactly that wide, no trailing spaces', () => {
    expect(
      perCharset((c, cs) => {
        const { text, rows, columns } = c.out[cs];
        // An empty diagram (`graph TD;`) is no lines: rows 0, columns 0.
        const lines = text === '' ? [] : text.split('\n');
        const widest = Math.max(0, ...lines.map((l) => cellWidth(l)));
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

  it('has no overlapping boxes (nodes apart; a node or group inside a group or apart)', () => {
    expect(problems((c) => overlaps(c.layout))).toEqual({});
  });

  // #45 (D78, R-ASCII-1): after the repair router no edge passes through a node box or another
  // edge's label.
  it('routes no edge through a node box or an edge label', () => {
    expect(
      problems((c) => {
        const graph = c.layout.flow.graph;
        const labels = new Set(graph.edges.map((e) => e.id));
        return routeCollisions(graph, c.layout, repairRoutes(graph, c.layout).routes).filter(
          (l) => l.kind === 'box' || (l.kind === 'label' && labels.has(l.with))
        );
      })
    ).toEqual({});
  });
});

interface Rect {
  id: string;
  group: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cells a centred box covers, the grid model's convention (`LayoutGraph.grid`). */
const rect = (
  id: string,
  group: boolean,
  b: { x: number; y: number; width: number; height: number }
): Rect => ({
  id,
  group,
  x0: Math.round(b.x - b.width / 2 + 0.5),
  y0: Math.round(b.y - b.height / 2 + 0.5),
  x1: Math.round(b.x + b.width / 2 - 0.5),
  y1: Math.round(b.y + b.height / 2 - 0.5),
});

function overlaps(model: LayoutModel): string[] {
  const rects = [
    ...[...model.nodes].map(([id, n]) => rect(id, false, n)),
    ...[...model.groups].map(([id, g]) => rect(id, true, g)),
  ];
  const apart = (a: Rect, b: Rect) => a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
  const within = (a: Rect, b: Rect) =>
    b.group && a.x0 > b.x0 && a.x1 < b.x1 && a.y0 > b.y0 && a.y1 < b.y1;
  const found: string[] = [];
  rects.forEach((a, i) => {
    for (const b of rects.slice(i + 1)) {
      if (!apart(a, b) && !within(a, b) && !within(b, a)) found.push(`${a.id} × ${b.id}`);
    }
  });
  return found;
}
